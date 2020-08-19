const RingCentral = require('@ringcentral/sdk').SDK
require('dotenv').load()

const sqlite3 = require('sqlite3').verbose();
var CALLREPORTING_DATABASE = './db/callreporting.db';
let db = new sqlite3.Database(CALLREPORTING_DATABASE);

const EventHandler = require('./event-engine.js')

function Engine(){
  this.extensionList = []
  this.accountId = ""
  this.eventHandler = undefined
  this.platform = null
}

var engine = Engine.prototype = {
    login: async function(){
      var clientId = process.env.CLIENT_ID_PROD
      var clientSecret = process.env.CLIENT_SECRET_PROD
      var serverURL = RingCentral.server.production
      var userName = process.env.USERNAME_PROD
      var password = process.env.PASSWORD_PROD
      var extension = process.env.EXTENSION_PROD

      if (process.env.MODE == "sandbox"){
        clientId = process.env.CLIENT_ID_SB
        clientSecret = process.env.CLIENT_SECRET_SB
        serverURL = RingCentral.server.sandbox
        userName = process.env.USERNAME_SB
        password = process.env.PASSWORD_SB
        extension = process.env.EXTENSION_SB
      }
      var rcsdk = new RingCentral({ server: serverURL, clientId: clientId, clientSecret:clientSecret })
      this.platform = rcsdk.platform()
      try{
        var resp = await rcsdk.login({username: userName, password: password, extension: extension,})
        var resp = await this.platform.get("/restapi/v1.0/account/~/")
        var respObj = await resp.json()
        this.accountId = respObj.id
        var thisClass = this
        thisClass.createCustomersTable((err, result) =>{
          thisClass.createCallLogsAnalyticsTable((err, result) =>{
            thisClass.setup()
          })
        })
      }catch(e){
        console.log('PLATFORM LOGIN ERROR ' + e.message || 'Server cannot authorize user');
      }
    },
    setup: function(){
      var thisClass = this
      this.extensionList = []
      this.readAccountExtensions("", (err, result) =>{
        thisClass.eventHandler = new EventHandler(thisClass.accountId, thisClass.extensionList)
        thisClass.subscribeForNotification()
      })
    },
    readAccountExtensions: async function(uri, callback){
      var endpoint = "/restapi/v1.0/account/~/extension"
      var params = {
        status: ["Enabled"],
        type: ["User"],
        perPage: 1000
      }
      if (uri != ""){
        endpoint = uri
        params = {}
      }
      try {
          var resp = await this.platform.get(endpoint, params)
          var jsonObj = await resp.json()
          for (var record of jsonObj.records){
            var extension = {
              id: record.id.toString(),
              name: record.name.trim()
            }
            this.extensionList.push(extension)
          }
          if (jsonObj.navigation.hasOwnProperty("nextPage"))
            await this.readAccountExtensions(jsonObj.navigation.nextPage.uri, callback)
          else
            callback(null, "readAccountExtensions: DONE")
      } catch (e) {
          console.error(e);
      }
    },
    subscribeForNotification: async function(){
      var query = `SELECT * FROM call_report_customers WHERE account_id='${this.accountId}' LIMIT 1`
      var thisClass = this
      db.get(query, (err, result) => {
        if (err){
          console.error(err.message);
        }else{
          if (result){
            if (process.env.DELETE_EXISTING_SUBSCRIPTION_ON_START == 1){
              thisClass.deteleExistingSubscription(result.subscription_id)
              thisClass.subscribeForTelephonySessionEventNotification()
            }else{
              console.log("Use old subscription")
            }
          }else{
            thisClass.subscribeForTelephonySessionEventNotification()
          }
        }
      })
    },
    deteleExistingSubscription: async function(subscriptionId){
      return deleteAllRegisteredWebHookSubscriptions(this.platform)
      try {
        await this.platform.delete(`/restapi/v1.0/subscription/${subscriptionId}`)
        console.log("Deleted " + subscriptionId)
      }catch (e){
        console.error(e)
      }
    },
    subscribeForTelephonySessionEventNotification: async function(){
      try {
        var params = {
                eventFilters: ["/restapi/v1.0/account/~/telephony/sessions"],
                deliveryMode: {
                    transportType: 'WebHook',
                    address: process.env.DELIVERY_MODE_ADDRESS
                },
                expiresIn: 630720000
        }
        let resp = await this.platform.post('/restapi/v1.0/subscription', params)
        var jsonObj = await resp.json()
        this.updateCustomersTable(jsonObj.id)
      }catch (e) {
        console.error(e);
      }
    },
    loadCallLogsPage: function (res) {
      res.render('calllogs', {
        data: this.extensionList
      })
    },
    loadReportingsPage: function (res) {
      res.render('reporting', {
        data: this.extensionList
      })
    },
    readCallLogs: function(req, res){
      var tableName = "call_report_logs_" + this.accountId
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (call_timestamp BETWEEN ${req.body.from} AND ${req.body.to})`
      if (req.body.extensions != ""){
        query += ` AND (extension_id IN ${req.body.extensions})`
      }
      if (req.body.direction != "*"){
        query += ` AND (direction ='${req.body.direction}')`
      }
      if (req.body.call_type != "*"){
        query += ` AND (call_type ='${req.body.call_type}')`
      }
      if (req.body.action != "*"){
        query += ` AND (call_action ='${req.body.action}')`
      }

      var logs = []
      var thisClass = this
      db.all(query, (err, result) => {
        if (err){
          console.error(err.message);
          var response = {
            status: "ok",
            data: logs
          }
          return res.send(response)
        }
        if (result){
          result.sort(sortCallTime)
          for (var item of result){
            var call = {
              id: item.extension_id,
              name: item.extension_name,
              partyId: item.party_id,
              sessionId: item.session_id,
              customerNumber: item.customer_number,
              agentNumber: item.agent_number,
              direction: item.direction,
              callTimestamp: parseInt(item.call_timestamp),
              ringTimestamp: parseInt(item.ring_timestamp),
              connectTimestamp: parseInt(item.connect_timestamp),
              disconnectTimestamp: parseInt(item.disconnect_timestamp),
              callHoldDuration: parseInt(item.call_hold_duration),
              holdingCount: item.hold_count,
              callType: item.call_type,
              callAction: item.call_action,
              callResult: item.call_result
            }
            logs.push(call)
          }
        }
        var response = {
            status: "ok",
            data: logs
          }
        res.send(response)
      });
    },
    readReports: function(req, res){
      var tableName = "call_report_logs_" + this.accountId
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (call_timestamp BETWEEN ${req.body.from} AND ${req.body.to})`
      if (req.body.extensions != ""){
        query += ` AND (extension_id IN ${req.body.extensions})`
      }
      var inboundActiveCalls = 0
      var outboundActiveCalls = 0
      for (var ext of this.eventHandler.monitoredExtensionList){
        if (ext.activeCalls.length){
          if (ext.activeCalls[0].status != "NO-CALL"){
            if (ext.activeCalls[0].direction == "Inbound")
              inboundActiveCalls++
            else
              outboundActiveCalls++
          }
        }
      }
      var reports = {
        inboundActiveCalls: inboundActiveCalls,
        outboundActiveCalls: outboundActiveCalls,
        inbound: 0,
        outbound: 0,
        connected: 0,
        cancelled: 0,
        voicemail: 0,
        missed: 0,
        parked: 0,
        directCall: 0,
        ringoutCall: 0,
        zoomCall: 0,
        inboundCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        outboundCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        missedCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        voicemailTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        totalInboundCallDuration: 0,
        totalInboundTalkDuration: 0,
        totalInboundHoldDuration: 0,
        totalInboundRespondDuration: 0,
        totalOutboundCallDuration: 0,
        totalOutboundTalkDuration: 0,
        totalOutboundHoldDuration: 0,
        longestCallDuration: 0,
        longestTalkDuration: 0,
        longestRespondDuration: 0,
        longestHoldDuration: 0
      }
      var thisClass = this
      db.all(query, (err, result) => {
        if (err){
          console.error(err.message);
          var response = {
            status: "ok",
            data: reports
          }
          return res.send(response)
        }
        if (result){
          var timeOffset = req.body.time_offset
          for (var item of result){
            var localTime  = parseInt(item.call_timestamp) + parseInt(timeOffset)
            var d = new Date(localTime)
            var hour = parseInt(d.toISOString().substring(11, 13))
            if (item.direction == "Inbound"){
              reports.inbound++
              reports.inboundCallTime[hour]++
              if (item.connect_timestamp > item.ring_timestamp){
                var tempTime = (parseInt(item.connect_timestamp) - parseInt(item.ring_timestamp)) / 1000
                if (tempTime < 120){ // cannot be longer than 2 mins???
                  reports.averageRespondTime += tempTime
                  if (tempTime > reports.longestRespondDuration)
                    reports.longestRespondDuration = tempTime
                }
              }else{
                //console.log(item.connecting_timestamp + " == " + item.ringing_timestamp)
              }
              reports.totalInboundCallDuration += parseInt(item.call_duration)
              reports.totalInboundHoldDuration += parseInt(item.call_hold_duration)
              reports.totalInboundRespondDuration += parseInt(item.call_respond_duration)
            }else {
              reports.outbound++
              reports.outboundCallTime[hour]++
              reports.totalOutboundCallDuration += parseInt(item.call_duration)
              reports.totalOutboundHoldDuration += parseInt(item.call_hold_duration)
            }
            if (item.call_action == "Connected")
              reports.connected++
            else if (item.call_action == "Cancelled")
              reports.cancelled++
            else if (item.call_action == "Voicemail"){
              reports.voicemail++
              reports.voicemailTime[hour]++
            }else if (item.call_action == "Missed Call"){
              reports.missed++
              reports.missedCallTime[hour]++
            }else if (item.call_action == "Parked"){
              reports.parked++
            }
            if (item.call_type == "Call")
              reports.directCall++
            else if (item.call_type == "RingOut")
              reports.ringoutCall++
            else if (item.call_type == "Zoom")
              reports.zoomCall++

            if (item.call_duration > reports.longestCallDuration)
              reports.longestCallDuration = item.call_duration

            if (item.connect_timestamp > 0){
              var tempTime = parseInt(item.disconnect_timestamp) - parseInt(item.connect_timestamp)
              tempTime = Math.round(tempTime/1000) - parseInt(item.call_hold_duration)
              if (tempTime > reports.longestTalkDuration)
                reports.longestTalkDuration = tempTime
            }

            if (item.call_hold_duration > reports.longestHoldDuration)
              reports.longestHoldDuration = item.call_hold_duration
          }
        }
        reports.totalInboundTalkDuration = (reports.totalInboundCallDuration - reports.totalInboundHoldDuration)
        reports.totalOutboundTalkDuration = (reports.totalOutboundCallDuration - reports.totalOutboundHoldDuration)
        var response = {
            status: "ok",
            data: reports
          }
        res.send(response)
      });
    },
    pollActiveCalls: function(res){
      for (var ext  of this.eventHandler.monitoredExtensionList){
        var currentTimestamp = new Date().getTime()
        for (var n=0; n<ext.activeCalls.length; n++){
          var call = ext.activeCalls[n]
          if (call.status == "CONNECTED" && call.localConnectTimestamp > 0){
            call.talkDuration = Math.round((currentTimestamp - call.localConnectTimestamp)/1000) - call.callHoldDuration
          }else if (call.status == "RINGING" && call.localRingTimestamp > 0)
            call.callRingDuration = Math.round((currentTimestamp - call.localRingTimestamp)/1000)
          else if (call.status == "HOLD" && call.localHoldTimestamp > 0)
            call.callHoldDuration = Math.round((currentTimestamp - call.localHoldTimestamp)/1000) + call.callHoldDurationTotal
        }
      }
      var response = {
          status: "ok",
          data: this.eventHandler.monitoredExtensionList
      }
      res.send(response)
    },
    createCallLogsAnalyticsTable: function(callback) {
      console.log("createCallLogsAnalyticsTable")
      var tableName = "call_report_logs_" + this.accountId
      var query = `CREATE TABLE IF NOT EXISTS ${tableName} (`
      query += 'party_id VARCHAR(48) PRIMARY KEY'
      query += ', session_id VARCHAR(12)'
      query += ', extension_id VARCHAR(15)'
      query += ', extension_name VARCHAR(64)'
      query += ', customer_number VARCHAR(15)'
      query += ', agent_number VARCHAR(15)'
      query += ', direction VARCHAR(12)',
      query += ', call_timestamp BIGINT DEFAULT 0'
      query += ', ring_timestamp BIGINT DEFAULT 0'
      query += ', connect_timestamp BIGINT DEFAULT 0'
      query += ', disconnect_timestamp BIGINT DEFAULT 0'
      query += ', call_hold_duration INT DEFAULT 0'
      query += ', hold_count INT DEFAULT 0'
      query += ', call_type VARCHAR(32)',
      query += ', call_action VARCHAR(15)',
      query += ', call_result VARCHAR(128)',
      query += ')'
      db.run(query, function(err, result) {
        if (err) {
          callback(err, err.message)
        }else{
          callback(null, "Ok")
        }
      });
    },
    createCustomersTable: function(callback) {
      var tableName = "call_report_customers"
      var query = `CREATE TABLE IF NOT EXISTS ${tableName} (account_id VARCHAR(15) PRIMARY KEY, subscription_id VARCHAR(48))`
      db.run(query, function(err, result) {
        if (err) {
          console.log(err, err.message)
          callback(err, err.message)
        }else{
          console.log("DONE")
          callback(null, "Ok")
        }
      });
    },
    updateCustomersTable: function(subscriptionId){
      var tableName = "call_report_customers"
      var query = `INSERT INTO ${tableName} (account_id, subscription_id)`
      query += " VALUES ('" + this.accountId + "','" + subscriptionId + "')"
      query += " ON CONFLICT (account_id) DO UPDATE SET subscription_id='" + subscriptionId + "'"
      query += " WHERE account_id='" + this.accountId + "'"
      db.run(query, function(err, result) {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("updateCustomersTable DONE");
        }
      });
    }
};

module.exports = Engine;

function sortCallTime(a, b){
  return b.call_timestamp - a.call_timestamp
}

async function deleteAllRegisteredWebHookSubscriptions(p) {
  let response = await p.get('/restapi/v1.0/subscription')
  let json = await response.json();
  if (json.records.length > 0){
    for (var record of json.records) {
      //if (record.deliveryMode.transportType == "WebHook"){
          await p.delete('/restapi/v1.0/subscription/' + record.id)
          console.log("Deleted")
      //}
    }
    console.log("Deleted all")
  }else{
    console.log("No subscription to delete")
  }
}

const pgdb = require('./db')
const RCPlatform = require('./platform.js')
var router = require('./router');
const Account = require('./event-engine.js')
var fs = require('fs')

require('dotenv').load()

function User(id, mode){
  this.id = id
  this.extensionList = []
  this.subscriptionId = ""
  this.updateData = false
  this.accountId = 0
  this.extensionId = 0
  this.userName = ""
  this.isAdminUser = false
  this.eventEngine = undefined
  this.platform_engine = new RCPlatform(mode)
}

var engine = User.prototype = {
  setExtensionId: function(id) {
      this.extensionId = id
    },
    setUserName: function (userName){
      this.userName = userName
    },
    getUserId: function(){
      return this.id
    },
    getExtensionId: function(){
      return this.extensionId
    },
    getUserName: function(){
      return this.userName;
    },
    getPlatform: function(){
      return this.platform_engine.getPlatform()
    },
    login: async function(req, res, callback){
      if (req.query.code) {
        var extensionId = await this.platform_engine.login(req.query.code)
        if (extensionId){
            this.setExtensionId(extensionId)
            req.session.extensionId = extensionId;
            callback(null, extensionId)
            var p = this.platform_engine.getPlatform()
            if (p){
              try {
                var resp = await p.get("/restapi/v1.0/account/~/extension/~/")
                var respObj = await resp.json()
                //if (respObj.permissions.admin.enabled){
                if (extensionId.toString() === process.env.ADMIN_EXT_ID || respObj.permissions.admin.enabled) { // Phong Vu fake admin
                    this.isAdminUser = true
                    console.log("Role: " + respObj.permissions.admin.enabled)
                }
                var fullName = respObj.contact.firstName + " " + respObj.contact.lastName
                this.setUserName(fullName)

                var resp = await p.get("/restapi/v1.0/account/~/")
                var respObj = await resp.json()
                this.accountId = respObj.id
                //changeNames(this.accountId)
                //return
                this.eventEngine = router.activeAccounts.find(o => o.accountId.toString() === this.accountId.toString())
                var thisClass = this
                thisClass.createAccountExtensionsTable((err, result) =>{
                  console.log("DONE createAccountExtensionsTable")
                  thisClass.createAccountMonitoredExtensionsTable((err, result) =>{
                    console.log("DONE createAccountMonitoredExtensionsTable")
                    thisClass.createCallLogsAnalyticsTable((err, result) =>{
                      console.log("DONE createCallLogsAnalyticsTable")
                      if (thisClass.isAdminUser)
                        thisClass.setup()
                      res.send('login success')
                    })
                  })
                })
              } catch (e) {
                console.error(e);
                res.send('login success');
              }
            }else{
              console.log('login failed')
              res.send('login failed');
            }
          }else {
            callback("error", this.extensionId)
          }
      } else {
        res.send('No Auth code');
        callback("error", null)
      }
    },
    setup: function(){
      if (this.eventEngine == undefined){
        this.eventEngine = new Account(this.accountId, "")
        this.eventEngine.setup((err, result) => {
          router.activeAccounts.push(this.eventEngine)// maybe no need
          this.subscribeForNotification()
        })
      }else{
        console.log("Handled in autoStart()")
        this.subscriptionId = this.eventEngine.subscriptionId
      }
    },
    loadSettingsPage: function(res){
      console.log("loadSettingsPage")
      res.render('settings',{
        userName: this.userName,
      })
    },
    logout: async function(req, res, callback){
      console.log("LOGOUT FUNC")
      await this.platform_engine.logout()
      callback(null, "logged out")
    },
    resetAccountSubscription: async function(req, res){
      var p = this.platform_engine.getPlatform()
      if (p){
        try {
          let response = await p.get('/restapi/v1.0/subscription')
          let json = await response.json();
          if (json.records.length > 0){
            for (var record of json.records) {
              if (record.deliveryMode.transportType == "WebHook"){
                if (this.subscriptionId == record.id){
                  await p.delete('/restapi/v1.0/subscription/' + record.id)
                  console.log("Deleted " + this.subscriptionId)
                }else
                  console.log("sub id " + record.id)
              }
            }
          }
          this.subscriptionId = ""
          if (req.query.delete == 'false'){
            await this.subscribeForNotification()
          }else{
            this.updateCustomersTable()
          }
          res.send({status:"ok"})
        }catch (e){
          console.error(e);
          res.send({status:"failed"})
        }
      }else{
        res.send({status:"failed"})
      }
    },
    getAccountExtensions: async function(res){
      var thisClass = this
      this.readAccountExtensionsFromTable((err, result) => {
        if (!err){
          if (result.length){
            var response = {
                status: "ok",
                extensions: result,
                monitoredExtensions: thisClass.eventEngine.monitoredExtensionList
            }
            res.send(response)
            console.log("load settings")
          }else{
            this.readExtensionFromServer(res, "", [])
          }
        }
      })
    },
    // only admin can read this
    readAccountExtensionsFromTable: function(callback){
      console.log("readAccountExtensionsFromTable")
      var tableName = "rt_extensions_" + this.accountId
      var query = "SELECT * FROM " + tableName
      var extensionList = []
      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          callback (err, null)
        }
        if (result.rows){
          for (var ext of result.rows){
            var extension = {
              id: ext.extension_id,
              name: ext.name
            }
            extensionList.push(extension)
          }
          console.log(extensionList.length)
          callback (null, extensionList)
        }
      });
    },
    readExtensionFromServer: async function(res, uri, extensionList){
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
      var p = this.platform_engine.getPlatform()
      if (p){
        try {
          var resp = await p.get(endpoint, params)
          var jsonObj = await resp.json()
          var fileName = "names.txt"
          var names = fs.readFileSync(fileName, 'utf-8').split(/\r?\n/)
          var i = 0
          for (var record of jsonObj.records){
            var item = {
              name: record.name.trim(),
              id: record.id
            }
            if (this.accountId == "37439510")
              item.name = names[i]
            i++
            if (i>=names.length)
              i=0
            extensionList.push(item)
          }
          if (jsonObj.navigation.hasOwnProperty("nextPage") && jsonObj.navigation.nextPage.uri)
            await this.readExtensionFromServer(res, jsonObj.navigation.nextPage.uri, extensionList)
          else{
            this.updateAccountExtensionsTable(extensionList)
            var response = {
                status: "ok",
                extensions: extensionList,
                monitoredExtensions: this.eventEngine.monitoredExtensionList
            }
            res.send(response)
          }
        } catch (e) {
          console.error(e);
          res.send({"status":"failed"})
        }
      }else{
        console.log('login failed')
      }
    },
    loadCallLogsPage: function (res) {
      var extensionList = (this.eventEngine != undefined) ? this.eventEngine.monitoredExtensionList : []
      res.render('calllogs', {
        userName: this.userName,
        data: extensionList
      })
    },
    loadReportingsPage: function (res) {
      var extensionList = (this.eventEngine != undefined) ? this.eventEngine.monitoredExtensionList : []
      res.render('reportings', {
        userName: this.userName,
        data: extensionList
      })
    },
    adminRemoveExtensions: async function(req, res){
      var status = "ok"
      if (this.isAdminUser){
        var extensions = JSON.parse(req.body.extensions)
        for (var extId of extensions){
          this.eventEngine.removeAccountMonitoredExtension(extId)
        }
        this.removeExtensionsFromAccountMonitoredTable(extensions)
      }else{
        status = "Not allowed"
      }
      response = {
        status: status,
        data: this.eventEngine.monitoredExtensionList
      }
      res.send(response)
    },
    adminAddExtensions: async function (req, res) {
      if (this.isAdminUser){
        var extensions = JSON.parse(req.body.extensions)
        var newExtensions = []

        for (var ext of extensions){
          if (!this.eventEngine.monitoredExtensionList.find(o => o.id.toString() == ext.id.toString())){
            var monitoredExtension = {
              id: ext.id,
              name: ext.name,
              callStatistics: {
                inboundCalls: 0,
                outboundCalls: 0,
                missedCalls: 0,
                voicemails: 0
              },
              activeCalls: []
            }
            newExtensions.push(monitoredExtension)
            this.eventEngine.monitoredExtensionList.push(monitoredExtension)
          }
        }
        this.updateAccountMonitoredExtensionsTable(newExtensions)
        var response = {
          status: "ok",
          data: this.eventEngine.monitoredExtensionList
        }
        res.send(response)
      }else{
        var response = {
          status: "Not allowed",
          data: []
        }
        res.send(response)
      }
    },
    subscribeForNotification: async function(){
      var p = this.platform_engine.getPlatform()
      if (p){
        try {
          if (this.subscriptionId == ""){
            let resp = await p.post('/restapi/v1.0/subscription',
                        {
                            eventFilters: ['/restapi/v1.0/account/~/telephony/sessions'],
                            deliveryMode: {
                                transportType: 'WebHook',
                                address: process.env.DELIVERY_MODE_ADDRESS
                            },
                            expiresIn: 31536000
                        })
            var jsonObj = await resp.json()
            console.log("Ready to receive telephonyStatus notification via WebHook.")
            this.subscriptionId = jsonObj.id
            this.eventEngine.subscriptionId = this.subscriptionId
            console.log("Create subscription")
            console.log(this.subscriptionId)
            this.updateCustomersTable()
          }else{
            let resp = await p.put(`/restapi/v1.0/subscription/${this.subscriptionId}`,
                        {
                            eventFilters: ['/restapi/v1.0/account/~/telephony/sessions'],
                            deliveryMode: {
                                transportType: 'WebHook',
                                address: process.env.DELIVERY_MODE_ADDRESS
                            },
                            expiresIn: 31536000
                        })
            var jsonObj = await resp.json()
            this.subscriptionId = jsonObj.id
            this.eventEngine.subscriptionId = this.subscriptionId
            console.log("Update subscription")
            console.log(this.subscriptionId)
          }

          // add a new engine
          if (this.eventEngine){
            console.log("Update eventEngine")
            this.eventEngine.subscriptionId = this.subscriptionId
          }else{
            console.log("create and add a new eventEngine")
            this.eventEngine = new Account(this.accountId, this.subscriptionId)
            this.eventEngine.setup()
            router.activeAccounts.push(this.eventEngine)
          }
        }catch (e) {
          console.error(e);
        }
      }
    },
    pollActiveCalls: function(res){
      if (this.eventEngine == undefined)
        return res.send({status: "failed", message: "Need admin setup"})
      for (var ext of this.eventEngine.monitoredExtensionList){
        var currentTimestamp = new Date().getTime()
        for (var n=0; n<ext.activeCalls.length; n++){
          var call = ext.activeCalls[n]
          if (call.status == "CONNECTED" && call.localConnectingTimestamp > 0)
            call.talkDuration = Math.round((currentTimestamp - call.localConnectingTimestamp)/1000) - call.callHoldDuration
          else if (call.status == "RINGING" && call.localRingingTimestamp > 0)
            call.callRespondDuration = Math.round((currentTimestamp - call.localRingingTimestamp)/1000)
          else if (call.status == "HOLD" && call.localHoldingTimestamp > 0)
            call.callHoldDuration = Math.round((currentTimestamp - call.localHoldingTimestamp)/1000) + call.callHoldDurationTotal
        }
      }
      var response = {
          status: "ok",
          data: this.eventEngine.monitoredExtensionList
      }
      res.send(response)
    },
    readCallLogs: function(req, res){
      if (this.eventEngine == undefined)
        return res.send({status: "failed", message: "Need admin setup"})
      var tableName = "rt_call_logs_" + this.accountId
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (calling_timestamp BETWEEN ${req.body.from} AND ${req.body.to})`
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
      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          var response = {
            status: "ok",
            data: logs
          }
          return res.send(response)
        }
        if (result.rows){
          result.rows.sort(sortCallTime)
          for (var item of result.rows){
            var obj = thisClass.eventEngine.monitoredExtensionList.find(o => o.id.toString() === item.extension_id)
            var name = (obj) ? obj.name : "Unknown"

            var call = {
              id: item.extension_id,
              name: name,
              partyId: item.party_id,
              sessionId: item.session_id,
              customerNumber: item.customer_number,
              agentNumber: item.agent_number,
              direction: item.direction,
              callTimestamp: parseInt(item.calling_timestamp),
              callDuration: parseInt(item.call_duration),
              ringTimestamp: parseInt(item.ringing_timestamp),
              connectTimestamp: parseInt(item.connecting_timestamp),
              disconnectTimestamp: parseInt(item.disconnecting_timestamp),
              holdTimestamp: parseInt(item.holding_timestamp),
              callHoldDuration: parseInt(item.call_hold_duration),
              holdingCount: item.holding_count,
              callRespondDuration: item.call_respond_duration,
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
      if (this.eventEngine == undefined)
        return res.send({status: "failed", message: "Need admin setup"})
      var tableName = "rt_call_logs_" + this.accountId
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (calling_timestamp BETWEEN ${req.body.from} AND ${req.body.to})`
      if (req.body.extensions != ""){
        query += ` AND (extension_id IN ${req.body.extensions})`
      }
      var inboundActiveCalls = 0
      var outboundActiveCalls = 0
      for (var ext of this.eventEngine.monitoredExtensionList){
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
      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          var response = {
            status: "ok",
            data: {}
          }
          return res.send(response)
        }
        if (result.rows){
          //result.sort(sortCallTime)
          var timeOffset = req.body.time_offset
          for (var item of result.rows){
            var localTime  = parseInt(item.calling_timestamp) + parseInt(timeOffset)
            var d = new Date(localTime)
            var hour = parseInt(d.toISOString().substring(11, 13))
            if (item.direction == "Inbound"){
              reports.inbound++
              reports.inboundCallTime[hour]++
              if (item.connecting_timestamp > item.ringing_timestamp){
                var tempTime = (parseInt(item.connecting_timestamp) - parseInt(item.ringing_timestamp)) / 1000
                if (tempTime > reports.longestRespondDuration)
                  reports.longestRespondDuration = tempTime

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

            if (item.connecting_timestamp > 0){
              var tempTime = parseInt(item.disconnecting_timestamp) - parseInt(item.connecting_timestamp)
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
    createCallLogsAnalyticsTable: function(callback) {
      console.log("createCallLogsAnalyticsTable")
      var tableName = "rt_call_logs_" + this.accountId
      var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' ('
      query += 'party_id VARCHAR(48) PRIMARY KEY'
      query += ', session_id VARCHAR(12)'
      query += ', extension_id VARCHAR(15)'
      query += ', customer_number VARCHAR(15)'
      query += ', agent_number VARCHAR(15)'
      query += ', direction VARCHAR(12)',
      query += ', calling_timestamp BIGINT DEFAULT 0'
      query += ', call_duration BIGINT DEFAULT 0'
      query += ', ringing_timestamp BIGINT DEFAULT 0'
      query += ', connecting_timestamp BIGINT DEFAULT 0'
      query += ', disconnecting_timestamp BIGINT DEFAULT 0'
      query += ', holding_timestamp BIGINT DEFAULT 0'
      query += ', call_hold_duration INT DEFAULT 0'
      query += ', holding_count INT DEFAULT 0'
      query += ', call_respond_duration INT DEFAULT 0'
      query += ', call_type VARCHAR(32)',
      query += ', call_action VARCHAR(15)',
      query += ', call_result VARCHAR(128)',
      query += ')'
      pgdb.create_table(query, (err, res) => {
          if (err) {
            console.log(err, res)
            callback(err, err.message)
          }else{
            console.log("DONE")
            callback(null, "Ok")
          }
        })
    },
    createAccountMonitoredExtensionsTable: function(callback) {
      console.log("createAccountMonitoredExtensionsTable")
      var tableName = "rt_analytics_" + this.accountId
      var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, added_timestamp BIGINT NOT NULL, name VARCHAR(64), inbound_calls INT DEFAULT 0, outbound_calls INT DEFAULT 0, missed_calls INT DEFAULT 0, voicemails INT DEFAULT 0)'
      pgdb.create_table(query, (err, res) => {
          if (err) {
            console.log(err, res)
            callback(err, err.message)
          }else{
            console.log("DONE")
            callback(null, "Ok")
          }
        })
    },
    createAccountExtensionsTable: function(callback) {
      console.log("createAccountExtensionsTable")
      var tableName = "rt_extensions_" + this.accountId
      var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, name VARCHAR(64))'
      pgdb.create_table(query, (err, res) => {
          if (err) {
            console.log(err, res)
            callback(err, err.message)
          }else{
            console.log("DONE")
            callback(null, "Ok")
          }
        })
    },
    updateAccountMonitoredExtensionsTable: function(extensionList){
      var tableName = "rt_analytics_" + this.accountId
      var query = "INSERT INTO " + tableName + " (extension_id, added_timestamp, name, inbound_calls, outbound_calls, missed_calls, voicemails) VALUES "
      var lastIndex = extensionList.length - 1
      for (var i=0; i<extensionList.length; i++){
        var ext = extensionList[i]
        var name = ext.name.replace(/'/g,"''")
        var t = new Date().getTime()
        if (i < lastIndex)
          query += `('${ext.id}',${t},'${name}', 0, 0, 0, 0),`
        else
          query += `('${ext.id}',${t},'${name}', 0, 0, 0, 0)`
      }
      query += " ON CONFLICT (extension_id) DO NOTHING" // UPDATE SET name='" + ext.name + "'"
      pgdb.insert(query, [], (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("updateAccountMonitoredExtensionsTable DONE");
        }
      })
    },
    removeExtensionsFromAccountMonitoredTable: function (idList){
      var extensions = ""
      for (var id of idList)
        extensions += "'"+id+"'"
      var tableName = "rt_analytics_" + this.accountId
      var query = 'DELETE FROM ' + tableName
      query += " WHERE extension_id IN (" + extensions + ")"
      console.log(query)
      pgdb.remove(query, (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("removeExtensionsFromAccountMonitoredTable DONE");
        }
      })
    },
    updateAccountExtensionsTable: function(extensionList){
      var tableName = "rt_extensions_" + this.accountId
      var query = "INSERT INTO " + tableName + "(extension_id, name) VALUES "
      var lastIndex = extensionList.length - 1
      for (var i=0; i<extensionList.length; i++){
      //for (var i=0; i<4; i++){
        var ext = extensionList[i]
        var name = ext.name.replace(/'/g,"''")
        if (i < lastIndex)
          query += `('${ext.id}','${name}'),`
        else
          query += `('${ext.id}','${name}')`
      }

      query += " ON CONFLICT (extension_id) DO NOTHING" // UPDATE SET name='" + ext.name + "'"
      pgdb.insert(query, [], (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("updateAccountExtensionsTable DONE");
        }
      })
    },
    updateCustomersTable: function(){
      var query = "INSERT INTO rt_call_analytics_customers (account_id, subscription_id)"
      query += " VALUES ($1,$2)"
      var values = [this.accountId, this.subscriptionId]
      query += " ON CONFLICT (account_id) DO UPDATE SET subscription_id='" + this.subscriptionId + "'"

      pgdb.insert(query, values, (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("updateCustomersTable DONE");
        }
      })
    },
    deleteReportData: function(res){
      var tableName = "rt_call_logs_" + this.accountId
      var query = "DELETE FROM " + tableName
      var thisClass = this
      pgdb.update(query, (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("delete call report data DONE")
          tableName = "rt_analytics_" + thisClass.accountId
          query = `UPDATE ${tableName} SET inbound_calls=0, outbound_calls=0, missed_calls=0, voicemails=0`
          pgdb.update(query, (err, result) =>  {
            if (err){
              console.error(err.message);
              console.log("QUERY: " + query)
            }else{
              console.log("delete call stats data DONE")
            }
            res.send({"status": "ok"})
          })
        }
      })
    }
};

module.exports = User;

function sortCallTime(a, b){
  return b.calling_timestamp - a.calling_timestamp
}

/// Clean up WebHook subscriptions
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

async function readAllRegisteredWebHookSubscriptions(p) {
  let response = await p.get('/restapi/v1.0/subscription')
  let json = await response.json();
  if (json.records.length > 0){
    for (var record of json.records) {
      if (record.deliveryMode.transportType == "WebHook"){
          console.log('subId: ' + record.id)
      }
    }
    if (json.records.length)
      deleteAllRegisteredWebHookSubscriptions(p)
  }else{
    console.log("No subscription to read")
  }
}

function sortByAddedDate(a, b){
  return b.added_timestamp - a.added_timestamp;
}

function changeNames(accountId){
  // read name file
  let fs = require('fs')
  let async = require('async')
  var fileName = "names.txt"
  var names = fs.readFileSync(fileName, 'utf-8').split(/\r?\n/)

  var tableName = "rt_analytics_" + accountId
  var query = "SELECT * FROM " + tableName
  var i = 0
  pgdb.read(query, (err, result) => {
    if (err){
      console.error(err.message);
    }
    if (result.rows){
      async.each(result.rows,
        function(extension, callback){
          var query = "UPDATE " + tableName + " SET name='" + names[i] + "' WHERE extension_id='" + extension.extension_id + "'"
          i++
          if (i >= names.length)
              i = 0
          pgdb.update(query, (err, result) =>  {
              if (err){
                console.error(err.message);
              }
              console.log(query)
              callback(null, result)
          })
        },
        function (err){
          console.log("update done")
        })
    }
  })
}

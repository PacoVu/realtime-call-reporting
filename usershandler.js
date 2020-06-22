const pgdb = require('./db')

const RCPlatform = require('./platform.js')
var router = require('./router');
const Account = require('./event-engine.js')

require('dotenv').load()


function User(id){
  this.id = id
  this.extensionList = []
  this.subscriptionId = ""
  this.eventFilters = []
  this.monitoredExtensionList = []
  this.updateData = false
  this.localTimeOffset = (3600 * 7 * 1000)
  this.accountId = 0
  this.extensionId = 0
  this.userName = ""
  this.isAdminUser = false
  this.eventEngine = null
  this.platform_engine = new RCPlatform(this)

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
            console.log(extensionId)
            callback(null, extensionId)
            var p = this.platform_engine.getPlatform()
            if (p){
              try {
                var resp = await p.get("/restapi/v1.0/account/~/extension/~/")
                var respObj = await resp.json()
                //if (respObj.permissions.admin.enabled){
                if (extensionId == "1426275020") { // Phong Vu fake admin
                    this.isAdminUser = true
                    console.log("Role: " + respObj.permissions.admin.enabled)
                }
                var fullName = respObj.contact.firstName + " " + respObj.contact.lastName
                this.setUserName(fullName)

                var resp = await p.get("/restapi/v1.0/account/~/")
                var respObj = await resp.json()
                console.log(respObj.id)
                //updateCustomersDb(respObj.id, respObj.mainNumber)
                var thisClass = this
                this.accountId = respObj.id
                //console.log("router.activeAccounts.length: " + router.activeAccounts.length)
                //console.log("router.activeAccounts[0].id: " + router.activeAccounts[0].accountId)
                //console.log("router.activeAccounts[0].subscriptionId: " + router.activeAccounts[0].subscriptionId)
                this.eventEngine = router.activeAccounts.find(o => o.accountId == respObj.id)
                //console.log("Check event engine")
                //console.log(this.eventEngine)
                createAccountExtensionsTable(respObj.id, (err, result) =>{
                  console.log("DONE createAccountExtensionsTable")
                  createAccountAnalyticsTable(respObj.id, (err, result) =>{
                    console.log("DONE createAccountAnalyticsTable")
                    createCallLogsAnalyticsTable(respObj.id, (err, result) =>{
                      console.log("DONE createCallLogsAnalyticsTable")
                      console.log(result)
                      thisClass.readExtensionsFromDb( async (err, result) => {
                        if (!err){
                          //await deleteAllRegisteredWebHookSubscriptions(p)
                          await thisClass.setup()
                          res.send('login success');
                        }
                      })
                    });
                  });
                });
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
    loadSettingsPage: function(res){
      res.render('/settings',{
        userName: this.userName,

      })
    },
    logout: async function(req, res, callback){
      console.log("LOGOUT FUNC")
      //var p = this.getPlatform()
      await this.platform_engine.logout()
      callback(null, "logged out")
    },
    readExtensionsFromDb: function(callback){
      console.log("readExtensionsFromDb")
      var tableName = "rt_extensions_" + this.accountId

      var query = "SELECT * FROM " + tableName
      //console.log(query)
      var thisClass = this
      this.extensionList = []

      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          callback (err, "")
        }
        if (result.rows){
          for (var ext of result.rows){
            var extension = {
              id: ext.extension_id,
              name: ext.name
            }
            thisClass.extensionList.push(extension)
          }
          callback (null, "Done readExtensionsFromDb")
        }
      });
    },
    setup: async function(){
      if (this.extensionList.length == 0){
        //this.extensionList = []
        var nav = await this.readExtension("")
      }
      if (this.eventEngine == undefined){
        console.log("this account is not found from engine")
        var tableName = "rt_analytics_" + this.accountId

        var query = "SELECT * FROM " + tableName
        var thisClass = this
        this.monitoredExtensionList = []
        this.eventFilters = []
        pgdb.read(query, (err, result) => {
          if (err){
            console.error(err.message);
            return
          }
          if (result.rows){
            for (var ext of result.rows){
              var extension = {
                id: ext.extension_id,
                name: ext.name,
                callStatistics: {
                  totalCallDuration: ext.total_call_duration,
                  totalCallRespondDuration: ext.total_call_respond_duration,
                  inboundCalls: ext.inbound_calls,
                  outboundCalls: ext.outbound_calls,
                  missedCalls: ext.missed_calls,
                  voicemails: ext.voicemails
                },
                activeCalls: []
              }
              thisClass.monitoredExtensionList.push(extension)
              //updateAnalyticsDb(thisClass.accountId, extension)
              thisClass.eventFilters.push(`/restapi/v1.0/account/~/extension/${ext.extension_id}/telephony/sessions`)
            }
          }
          if (thisClass.eventFilters.length){
            thisClass.subscribeForNotification()
          }
          updateAccountExtensionsDb(thisClass.accountId, thisClass.extensionList)
        });
      }else{
        console.log("Handle in autoStart()")
        //console.log(JSON.stringify(this.eventEngine.monitoredExtensionList))
        this.monitoredExtensionList = this.eventEngine.monitoredExtensionList
        this.subscriptionId = this.eventEngine.subscriptionId
        for (var ext of this.monitoredExtensionList)
          this.eventFilters.push(`/restapi/v1.0/account/~/extension/${ext.id}/telephony/sessions`)
      }
    },
    readExtension: async function(uri){
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
          //console.log(jsonObj.navigation)
          for (var record of jsonObj.records){
            var item = {
              name: record.name,
              id: record.id,
              numbers: record.extensionNumbers
            }
            this.extensionList.push(item)
          }
          if (jsonObj.navigation.hasOwnProperty("nextPage") && jsonObj.navigation.nextPage.uri)
            await this.readExtension(jsonObj.navigation.nextPage.uri)
        } catch (e) {
          console.error(e);
        }
      }else{
        console.log('login failed')
      }
    },
    readExtensions: function(res){
      var response = {
          status: "ok",
          extensions: this.extensionList,
          data: this.monitoredExtensionList
      }
      res.send(response)
    },
    loadCallLogsPage: function (res) {
      res.render('calllogs', {
        userName: this.userName,
        data: this.monitoredExtensionList
      })
    },
    loadReportingsPage: function (res) {
      res.render('reportings', {
        userName: this.userName,
        data: this.monitoredExtensionList
      })
    },
    removeExtension: async function(req, res){
      var id = req.query.id
      //console.log(this.eventFilters)
      for (var i=0; i< this.eventFilters.length; i++){
        var filter = this.eventFilters[i]
        if (filter.indexOf(id) > 0){
          this.eventFilters.splice(i, 1)
          break
        }
      }
      await this.subscribeForNotification()
      for (var i=0; i< this.monitoredExtensionList.length; i++){
        var extension = this.monitoredExtensionList[i]
        if (extension.id == id){
          this.monitoredExtensionList.splice(i, 1)
          break
        }
      }

      //console.log("AFTER")
      //console.log(this.eventFilters)
      response = {
        status: "ok",
        data: this.monitoredExtensionList
      }
      res.send(response)
    },
    addExtensions: async function (req, res) {
      var extensionId = req.query.id
      var extensionName = req.query.name
      for (var item of this.eventFilters){
        if (item.indexOf(extensionId) > 0)
        return res.send({ status: "duplicated"})
      }
      this.eventFilters.push(`/restapi/v1.0/account/~/extension/${extensionId}/telephony/sessions`)
      await this.subscribeForNotification()
      var monitoredExtension = {
        id: extensionId,
        name: extensionName,
        callStatistics: {
          totalCallDuration: 0,
          totalCallRespondDuration: 0,
          inboundCalls: 0,
          outboundCalls: 0,
          missedCalls: 0,
          voicemails: 0
        },
        activeCalls: []
      }
      // add this user to monitoring list
      this.monitoredExtensionList.push(monitoredExtension)
      // add this user to db
      updateAnalyticsDb(this.accountId, monitoredExtension)
      var response = {
        status: "ok",
        data: monitoredExtension
      }
      res.send(response)
      // read call stats from db and fill out the callStatistics data object
    },
    subscribeForNotification: async function(){
      console.log(this.eventFilters)
      var p = this.platform_engine.getPlatform()
      if (p){
        try {
          if (this.subscriptionId == ""){
            let resp = await p.post('/restapi/v1.0/subscription',
                        {
                            eventFilters: this.eventFilters, // ['/restapi/v1.0/account/~/telephony/sessions'], //
                            deliveryMode: {
                                transportType: 'WebHook',
                                address: process.env.DELIVERY_MODE_ADDRESS
                            },
                            expiresIn: 31536000
                        })
            var jsonObj = await resp.json()
            console.log("Ready to receive telephonyStatus notification via WebHook.")
            this.subscriptionId = jsonObj.id
            console.log("Create subscription")
            console.log(this.subscriptionId)
          }else{
            let resp = await p.put(`/restapi/v1.0/subscription/${this.subscriptionId}`,
                        {
                            eventFilters: this.eventFilters,
                            deliveryMode: {
                                transportType: 'WebHook',
                                address: process.env.DELIVERY_MODE_ADDRESS
                            },
                            expiresIn: 31536000
                        })
            var jsonObj = await resp.json()
            console.log("Update subscription")
            console.log(this.subscriptionId)
            this.subscriptionId = jsonObj.id
          }

          updateCustomersDb(this.accountId, this.subscriptionId)
          // add a new engine
          if (this.eventEngine){
            console.log("Update eventEngine")
            this.eventEngine.subscriptionId = this.subscriptionId
          }else{
            console.log("create and add a new eventEngine")
            this.eventEngine = new Account(this.accountId, this.subscriptionId)
            this.eventEngine.setup()
            this.eventEngine.monitoredExtensionList = this.monitoredExtensionList
            router.activeAccounts.push(this.eventEngine)
          }
        }catch (e) {
          console.error(e);
        }
      }
    },
    pollActiveCalls: function(res){
      if (this.eventEngine)
        this.eventEngine.pollActiveCalls(res)
    },
    readCallLogs: function(req, res){
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
          var options = { year: 'numeric', month: 'short', day: 'numeric' };
          for (var item of result.rows){
            var obj = thisClass.monitoredExtensionList.find(o => o.id === item.extension_id)
            var name = (obj) ? obj.name : "Unknown"

            //var ringTime = (item.ringing_timestamp > 0) ? new Date(item.ringing_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
            //var connectTime = (item.connecting_timestamp> 0) ? new Date(item.connecting_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
            var call = {
              id: item.extension_id,
              name: name,
              sessionId: item.session_id,
              customerNumber: item.customer_number,
              agentNumber: item.agent_number,
              direction: item.direction,
              //startDate: "", //new Date(item.calling_timestamp - thisClass.localTimeOffset).toLocaleDateString("en-US", options),
              callTimestamp: item.calling_timestamp, //new Date(item.calling_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0],  // DOUBLE DEFAULT 0'
              callDuration: item.call_duration,
              ringTimestamp: item.ringing_timestamp, //ringTime,
              connectTimestamp: item.connecting_timestamp, //connectTime,
              disconnectTimestamp: item.disconnecting_timestamp, //new Date(item.disconnecting_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0], // DOUBLE DEFAULT 0'
              holdTimestamp: item.holding_timestamp,
              callHoldDuration: item.call_hold_duration,
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
      var tableName = "rt_call_logs_" + this.accountId
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (calling_timestamp BETWEEN ${req.body.from} AND ${req.body.to})`
      if (req.body.extensions != ""){
        query += ` AND (extension_id IN ${req.body.extensions})`
      }
      //console.log("copy monotored list from engine. Need to create a list for this user")
      this.monitoredExtensionList = this.eventEngine.monitoredExtensionList
      var inboundActiveCalls = 0
      var outboundActiveCalls = 0
      for (var ext of this.monitoredExtensionList){
        if (ext.activeCalls.length){
          if (ext.activeCalls[0].status != "NO-CALL"){
            if (ext.activeCalls[0].direction == "Inbound")
              inboundActiveCalls++
            else
              outboundActiveCalls++
          }else{
            console.log("REMOVE NO CALL ITEM?")
            ext.activeCalls.splice(0, 1);
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
        longestHoldDuration: 0,
        averageRespondDuration: 0,
        averageHoldDuration: 0
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
          /*
          query += ', call_duration BIGINT DEFAULT 0'
          query += ', call_hold_duration INT DEFAULT 0'
          query += ', call_respond_duration INT DEFAULT 0'
          */
          var timeOffset = req.body.time_offset
          for (var item of result.rows){
            var d = new Date(item.calling_timestamp - timeOffset)
            var hour = parseInt(d.toISOString().substring(11, 13))
            if (item.direction == "Inbound"){
              reports.inbound++
              reports.inboundCallTime[hour]++
              if (item.connecting_timestamp > item.ringing_timestamp){
                var tempTime = (item.connecting_timestamp - item.ringing_timestamp) / 1000
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
            var tempTime = item.call_duration - item.call_hold_duration
            if (tempTime > reports.longestTalkDuration)
              reports.longestTalkDuration = tempTime

            if (item.call_hold_duration > reports.longestHoldDuration)
              reports.longestHoldDuration = item.call_hold_duration

            //reports.averageHoldTime: 0
          }
        }
        //console.log(reports.averageRespondTime)
        reports.totalInboundTalkDuration = (reports.totalInboundCallDuration - reports.totalInboundHoldDuration)
        reports.averageRespondDuration /= reports.inbound
        //console.log(reports)
        var response = {
            status: "ok",
            data: reports
          }
        res.send(response)
      });
    },
    checkSubscription: function(){
      readAllRegisteredWebHookSubscriptions()
    }
};

module.exports = User;

function sortCallTime(a, b){
  return b.calling_timestamp - a.calling_timestamp
}

function formatDurationTime(dur){
  dur = Math.floor(dur)
  if (dur > 86400) {
    var d = Math.floor(dur / 86400)
    dur = dur % 86400
    var h = Math.floor(dur / 3600)
    //h = (h>9) ? h : "0" + h
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return d + "d " + h + ":" + m + ":" + s
  }else if (dur >= 3600){
    var h = Math.floor(dur / 3600)
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return h + ":" + m + ":" + s
  }else if (dur >= 60){
    var m = Math.floor(dur / 60)
    dur %= 60
    var s = (dur>9) ? dur : ("0" + dur)
    return m + ":" + s
  }else{
    //var s = (dur>9) ? dur : ("0" + dur)
    return dur + " secs"
  }
}

async function startWebhookSubscription(extensionId) {
    var eventFilters = ['/restapi/v1.0/account/~/extension/' + extensionId+ '/telephony/sessions']
    var res = await  rcsdk.post('/restapi/v1.0/subscription',
              {
                  eventFilters: eventFilters,
                  deliveryMode: {
                      transportType: 'WebHook',
                      address: process.env.DELIVERY_MODE_ADDRESS
                  }
              })
    var jsonObj = await res.json()
    console.log("Ready to receive telephonyStatus notification via WebHook.")
    g_subscriptionId = jsonObj.id
    storeSubscriptionId(jsonObj.id)
}

/// Clean up WebHook subscriptions
async function deleteRegisteredWebHookSubscription(id) {
  let response = await rcsdk.get('/restapi/v1.0/subscription')
  let json = await response.json();
  if (json.records.length > 0){
    for (var record of json.records) {
      if (record.deliveryMode.transportType == "WebHook"){
        if (id == record.id){
          await rcsdk.delete('/restapi/v1.0/subscription/' + record.id)
          return console.log("Deleted " + id)
        }
      }
    }
  }
  console.log("no active subscription")
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

async function readAllRegisteredWebHookSubscriptions() {
  let response = await rcsdk.get('/restapi/v1.0/subscription')
  let json = await response.json();
  if (json.records.length > 0){
    for (var record of json.records) {
      if (record.deliveryMode.transportType == "WebHook"){
          console.log('subId: ' + record.id)
      }
    }
  }else{
    console.log("No subscription to read")
  }
}


function readAnalyticsDb(extensionId, callback){
  var tableName = "rt_analytics_" + accountId
  var query = "SELECT * FROM " + tableName + " WHERE extension_id='" + extensionId + "'"
  pgdb.read(query, (err, result) => {
    if (err){
      console.error(err.message);
      callback("err", null)
    }
    var allRows = result.rows
    if (result.rows){
      var item = result.row[0]
      var extension = {
        id: item.extension_id,
        name: item.name,
        callStatistics: {
          totalCallDuration: item.total_call_duration,
          totalCallRespondDuration: item.total_call_respond_duration,
          inboundCalls: item.inbound_calls,
          outboundCalls: item.outbound_calls,
          missedCalls: item.missed_calls,
          voicemails: item.voicemails
        },
        activeCalls: []
      }
      callback("err", extension)
    }else
      callback("err", null)
  })
}

function updateAnalyticsDb(accountId, extension){
  var tableName = "rt_analytics_" + accountId
  var query = 'INSERT INTO ' + tableName //+ ' (extension_id, added_timestamp, name, total_call_duration, total_call_respond_duration, inbound_calls, outbound_calls, missed_calls, voicemails)'
  query += " VALUES ('" + extension.id
  query += "'," + new Date().getTime()
  query += ",'" + extension.name.trim()
  query += "'," + extension.callStatistics.totalCallDuration
  query += "," + extension.callStatistics.totalCallRespondDuration
  query += "," + extension.callStatistics.inboundCalls
  query += "," + extension.callStatistics.outboundCalls
  query += "," + extension.callStatistics.missedCalls
  query += "," + extension.callStatistics.voicemails + ")"

  query += ' ON CONFLICT (extension_id) DO UPDATE SET total_call_duration= ' + extension.callStatistics.totalCallDuration + ","
  query += ' total_call_respond_duration= ' + extension.callStatistics.totalCallRespondDuration + ", "
  query += ' inbound_calls= ' + extension.callStatistics.inboundCalls + ", "
  query += ' outbound_calls= ' + extension.callStatistics.outboundCalls + ", "
  query += ' missed_calls= ' + extension.callStatistics.missedCalls + ", "
  query += ' voicemails= ' + extension.callStatistics.voicemails
  console.log(query)
  pgdb.insert(query, [], (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("updateCallLogDb DONE");
    }
  })
}

function createAccountExtensionsTable(accountId, callback) {
  console.log("createAccountExtensionsTable")
  var tableName = "rt_extensions_" + accountId
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
}

function createAccountAnalyticsTable(accountId, callback) {
  console.log("createAccountAnalyticsTable")
  var tableName = "rt_analytics_" + accountId
  var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, added_timestamp BIGINT NOT NULL, name VARCHAR(64), total_call_duration BIGINT DEFAULT 0, total_call_respond_duration BIGINT DEFAULT 0, inbound_calls INT DEFAULT 0, outbound_calls INT DEFAULT 0, missed_calls INT DEFAULT 0, voicemails INT DEFAULT 0)'
  pgdb.create_table(query, (err, res) => {
      if (err) {
        console.log(err, res)
        callback(err, err.message)
      }else{
        console.log("DONE")
        callback(null, "Ok")
      }
    })
}

function createCallLogsAnalyticsTable(accountId, callback) {
  console.log("createAccountAnalyticsTable")
  var tableName = "rt_call_logs_" + accountId

  var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' ('
  query += 'session_id VARCHAR(12) PRIMARY KEY'
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
}

function updateAccountExtensionsDb(accountId, extensionList){
  var tableName = "rt_extensions_" + accountId
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
      console.log("updateAccountExtensionsDb DONE");
    }
  })
}

function updateCustomersDb(accountId, subscriptionId){
  var query = "INSERT INTO rt_call_analytics_customers (account_id, subscription_id)"
  query += " VALUES ($1,$2)"
  var values = [accountId, subscriptionId]
  query += " ON CONFLICT (account_id) DO UPDATE SET subscription_id='" + subscriptionId + "'"

  pgdb.insert(query, values, (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("updateCustomersDb DONE");
    }
  })
}

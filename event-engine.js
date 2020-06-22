const pgdb = require('./db')

var fs = require('fs')
require('dotenv').load()

function Account(accountId, subscriptionId){
  this.accountId = accountId
  this.subscriptionId = subscriptionId
  this.extensionList = []
  this.monitoredExtensionList = []
  this.updateData = false
  this.localTimeOffset = (3600 * 7 * 1000)
}

var engine = Account.prototype = {
    setup: async function(){
      var tableName = "rt_analytics_" + this.accountId
      var query = "SELECT * FROM " + tableName
      var thisClass = this
      this.monitoredExtensionList = []
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
          }
        }
        console.log("Done autosetup")
        //updateAccountExtensionsDb(thisClass.accountId, thisClass.extensionList)
      });
    },
    pollActiveCalls: function(res){
      for (var ext  of this.monitoredExtensionList){
        var currentTimestamp = new Date().getTime()
        for (var n=0; n<ext.activeCalls.length; n++){
          var call = ext.activeCalls[n]
          call.localCurrentTimestamp = new Date().getTime()
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
        update: this.updateData,
        data: this.monitoredExtensionList
      }
      //console.log("POLLING DATA")
      //console.log(JSON.stringify(this.monitoredExtensionList[0].activeCalls))
      //console.log("==============")
      this.updateData = false
      res.send(response)

      if (!this.updateData){
        //for (var i=0; i<this.monitoredExtensionList.length; i++){
        for (var ext  of this.monitoredExtensionList){
          //var ext = this.monitoredExtensionList[i]
          for (var n=0; n<ext.activeCalls.length; n++){
            var call = ext.activeCalls[n]
            //console.log("call.status " + call.status )
            if (call.status == "NO-CALL"){
              ext.activeCalls.splice(n, 1);
              console.log("remove active call?")
            }
          }
        }
      }
    },
    processNotification: function(jsonObj){
      //console.log(JSON.stringify(jsonObj))
      console.log("+++++++++++ NEW EVENT ++++++++++++")
      // parse tel notification payload
      if (this.monitoredExtensionList.length){
        for (var party of jsonObj.body.parties){
          var extensionFound = false
          if (party.extensionId){
            var extension = this.monitoredExtensionList.find(o => o.id === party.extensionId);
            if (extension){
              extensionFound = true
              console.log("=======")
              console.log(extension.id + "==" +  party.extensionId)
              console.log("Code: " + party.status.code)
              //console.log("Seq: " + jsonObj.body.sequence)
              console.log("Time: " + jsonObj.body.eventTime)
              console.log("=======")

              if (extension.activeCalls.length){
                console.log("has active call")
                console.log("status: " + party.status.code)
                for (var n=0; n < extension.activeCalls.length; n++){
                  var call = extension.activeCalls[n]
                  if (call.sessionId == jsonObj.body.sessionId){
                    if (party.status.code == "Proceeding"){
                      call.ringingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                      call.localRingingTimestamp = new Date().getTime()
                      call.status = "RINGING"
                    }else if(party.status.code == "Answered"){
                      if (call.status == "HOLD"){
                        var timeNow = new Date(jsonObj.body.eventTime).getTime()
                        timeNow = Math.round((timeNow - call.holdingTimestamp) / 1000)
                        call.callHoldDurationTotal += parseInt(timeNow)
                      }else{
                        call.connectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                        call.localConnectingTimestamp = new Date().getTime()
                        if (call.direction == "Inbound" && call.status == "RINGING"){
                          var respondTime = (call.connectingTimestamp - call.ringingTimestamp) / 1000
                          call.callRespondDuration = Math.round(respondTime)
                          console.log("call ringing time " + call.ringingTimestamp);
                          console.log("call resp time " + call.callRespondDuration);
                          extension.callStatistics.totalcallRespondDuration += parseInt(call.callRespondDuration)
                        }
                      }
                      call.status = "CONNECTED"
                    }else if(party.status.code == "Disconnected"){
                      //console.log("IS SECOND CALL DISCONNECTED EVENT ???")
                      if (call.status == "NO-CALL"){
                        console.log("return from here")
                        return
                      }
                      call.disconnectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                      this.handleDisconnection(extension, call, false)
                    }else if(party.status.code == "Voicemail"){
                      call.status = "VOICEMAIL"
                    }else if(party.status.code == "Hold"){
                      call.holdingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                      call.localHoldingTimestamp = new Date().getTime()
                      call.status = "HOLD"
                      call.holdingCount++
                    }else if(party.status.code == "Parked"){
                      call.status = "PARKED"
                      console.log("Parked: " + jsonObj.body.eventTime)
                      if (party.park.id)
                        call.parkNumber = party.park.id
                      //call.callingTimestamp = new Date(jsonObj.body.eventTime).getTime()

                    }else if(party.status.code == "Setup"){
                      if (call.status == "RINGING") { // most probably a disorder sequence
                        call.callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                        //call.startTime = new Date(call.callingTimestamp - this.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0]
                      }
                    }
                    if (party.direction == "Inbound"){
                      if (party.from)
                        call.customerNumber = party.from.phoneNumber
                      else
                        call.customerNumber = "Private"
                      if (party.to)
                        call.agentNumber = party.to.phoneNumber
                      else
                        call.agentNumber = "Unknown"
                    }else{ // outbound
                      call.customerNumber = party.to.phoneNumber
                      call.agentNumber = party.from.phoneNumber
                    }
                    break
                  }
                }
                // new call => multiple calls
                if (n >= extension.activeCalls.length){
                  console.log("another active call")
                  // IGNORE for now
                  //var activeCall = this.createNewCallToActiveCall(jsonObj, party)
                  //extension.activeCalls.push(activeCall)
                  break
                }
              }else{
                // add new active call
                console.log("new call")
                console.log("Code: " + party.status.code)
                console.log("Time: " + jsonObj.body.eventTime)
                console.log("=======")
                var activeCall = this.createNewCallToActiveCall(jsonObj, party)
                extension.activeCalls.push(activeCall)
              }
            }
          }else{ // no extension id from the party
            console.log("no extension id from the party")
            console.log("Code: " + party.status.code)
            console.log("Time: " + jsonObj.body.eventTime)
            console.log("=======")
            for (var extension of this.monitoredExtensionList){
              var call = extension.activeCalls.find(o => o.sessionId === jsonObj.body.sessionId);
              if (call){
                if (party.status.code == "Disconnected"){
                  if (call.status != "NO-CALL") {
                    call.disconnectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                    this.handleDisconnection(extension, call, true)
                    break
                  }
                }else if(party.status.code == "Parked"){
                  call.status = "PARKED"
                  if (party.park.id)
                    call.parkNumber = party.park.id
                  console.log("Parked: " + jsonObj.body.eventTime)
                  //call.callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                }
              }
            }
          }
        }
      }else{
        // empty monitoring list
        console.log("No extension on the monitoring list")
      }
    },
    handleDisconnection: function(extension, call, isCustomer){
      if (call.connectingTimestamp > 0){
        call.callDuration = Math.round((call.disconnectingTimestamp - call.connectingTimestamp) / 1000)
        //call.callDuration = callDur
        console.log("Total Call Dur: " + extension.callStatistics.totalCallDuration)
        extension.callStatistics.totalCallDuration += parseInt(call.callDuration)
        console.log("AFTER Total Call Dur: " + extension.callStatistics.totalCallDuration)
      }
      if (call.direction == "Inbound"){
        extension.callStatistics.inboundCalls++
      }else {
        extension.callStatistics.outboundCalls++
      }

      if (call.status == "CONNECTED"){ // call terminated
        if (isCustomer)
          call.callResult = "Customer hanged up."
        else
          call.callResult = "Agent hanged up."
        call.callAction = "Connected"
      }else if (call.status == "RINGING"){ // missed call
        console.log("Missed call detected by call status.")
        extension.callStatistics.missedCalls++
        call.callResult = "Missed call."
        call.callAction = "Missed Call"
      }else if (call.status == "HOLD"){ // transfered or disconnected
        if (isCustomer){
          console.log("CUSTOMER hangs up during on hold")
          call.callResult = "Customer hanged up during on-hold."
        }else{
          console.log("AGENT hangs up during on hold")
          call.callResult = "Agent hanged up during on-hold."
        }
        call.callHoldDurationTotal += (call.disconnectingTimestamp - call.holdingTimestamp) / 1000
      }else if (call.status == "VOICEMAIL"){ // to voicemail
        extension.callStatistics.voicemails++
        call.callResult = "Voicemail."
        call.callAction = "Voicemail"
      }else if (call.status == "SETUP"){
        call.callAction = "Cancelled"
        call.callResult = "Call was cancelled"
      }else if (call.status == "PARKED"){
        call.callAction = "Parked"
        call.callResult = "Call was parked."
        //if (party.park.id)
        //  call.parkNumber = party.park.id
        console.log("CALL PARKED")
      }else{
        call.callAction = call.status
        call.callResult = "Unknown call status"
      }
      call.status = "NO-CALL"
      updateCallLogDb(this.accountId, extension.id, call)
      updateAnalyticsDb(this.accountId, extension)
    },
    createNewCallToActiveCall: function (jsonObj, party) {
      // dealing with sequence out of order
      var status = ""
      var startTime = ""
      var ringingTimestamp= 0
      var connectingTimestamp= 0
      var disconnectingTimestamp= 0
      var callingTimestamp = 0
      if (party.status.code == "Setup"){
        callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
        //startTime = new Date(callingTimestamp - this.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0]
        status = "SETUP"
      }else if (party.status.code == "Proceeding"){
        ringingTimestamp = new Date(jsonObj.body.eventTime).getTime()
        status = "RINGING"
      }else if (party.status.code == "Answered"){
        connectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
        status = "CONNECTED"
      }else if (party.status.code == "Disconnected"){
        disconnectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
        status = "NO-CALL"
      }
      var activeCall = {
                sessionId: jsonObj.body.sessionId,
                telephonySessionId: party.id,
                customerNumber: "",
                agentNumber: "",
                status: status,
                direction: party.direction,
                callingTimestamp: callingTimestamp,
                //startTime: startTime,
                callDuration: 0,
                ringingTimestamp: ringingTimestamp,
                connectingTimestamp: connectingTimestamp,
                disconnectingTimestamp: disconnectingTimestamp,
                holdingTimestamp: 0,
                callHoldDuration: 0,
                callHoldDurationTotal: 0,
                holdingCount: 0,
                callRespondDuration: 0,
                callType: jsonObj.body.origin.type,
                callAction: "",
                callResult: "",
                talkDuration: 0,
                parkNumber: "",
                localRingingTimestamp: 0,
                localConnectingTimestamp: 0,
                localHoldingTimestamp: 0
              }
      return activeCall
    },
    /*
    readCallLogs: function(req, res){
      let db = new sqlite3.Database(ANALYTICS_DATABASE);
      var tableName = "rt_call_logs_" + this.accountId // "analytics_809646016" //
      var from = new Date(req.body.from).getTime() + this.localTimeOffset
      var to = new Date(req.body.to).getTime() + this.localTimeOffset
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (calling_timestamp BETWEEN ${from} AND ${to})`
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
      db.all(query, function (err, result) {
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
          var options = { year: 'numeric', month: 'short', day: 'numeric' };
          for (var item of result){
            var obj = thisClass.monitoredExtensionList.find(o => o.id === item.extension_id)
            var name = (obj) ? obj.name : "Unknown"

            //var startTime = new Date(item.calling_timestamp).toLocaleDateString("en-US", options)
            var ringTime = (item.ringing_timestamp > 0) ? new Date(item.ringing_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
            var connectTime = (item.connecting_timestamp> 0) ? new Date(item.connecting_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
            var call = {
              id: item.extension_id,
              name: name,
              sessionId: item.session_id,
              customerNumber: item.customer_number,
              agentNumber: item.agent_number,
              direction: item.direction,
              startDate: new Date(item.calling_timestamp - thisClass.localTimeOffset).toLocaleDateString("en-US", options),
              startTime: new Date(item.calling_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0],
              callDuration: item.call_duration,
              ringTime: ringTime,
              connectTime: connectTime,
              disconnectTime: new Date(item.disconnecting_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0],
              holdTime: item.holding_timestamp,
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
      let db = new sqlite3.Database(ANALYTICS_DATABASE);
      var tableName = "rt_call_logs_" + this.accountId
      var from = new Date(req.body.from).getTime() + this.localTimeOffset
      var to = new Date(req.body.to).getTime() + this.localTimeOffset
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (calling_timestamp BETWEEN ${from} AND ${to})`
      if (req.body.extensions != ""){
        query += ` AND (extension_id IN ${req.body.extensions})`
      }
      var reports = {
        inbound: 0,
        outbound: 0,
        connected: 0,
        cancelled: 0,
        voicemail: 0,
        missedCall: 0,
        directCall: 0,
        ringoutCall: 0,
        zoomCall: 0,
        inboundCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        outboundCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        missedCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        voicemailTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        totalInboundCallDuration: 0,
        totalOutboundCallDuration: 0,
        longestCallDuration: 0,
        longestTalkTime: 0,
        longestRespondTime: 0,
        longestHoldTime: 0,
        averageRespondTime: 0,
        averageHoldTime: 0
      }
      var thisClass = this
      db.all(query, function (err, result) {
        if (err){
          console.error(err.message);
          var response = {
            status: "ok",
            data: {}
          }
          return res.send(response)
        }
        if (result){
          //result.sort(sortCallTime)
          for (var item of result){
            var d = new Date(item.calling_timestamp - thisClass.localTimeOffset)
            var hour = parseInt(d.toISOString().substring(11, 13))
            if (item.direction == "Inbound"){
              reports.inbound++
              reports.inboundCallTime[hour]++
              if (item.connecting_timestamp > item.ringing_timestamp){
                var tempTime = (item.connecting_timestamp - item.ringing_timestamp) / 1000
                if (tempTime < 120){ // cannot be longer than 2 mins
                  reports.averageRespondTime += tempTime
                  if (tempTime > reports.longestRespondTime)
                    reports.longestRespondTime = tempTime
                }
              }else{
                //console.log(item.connecting_timestamp + " == " + item.ringing_timestamp)
              }
              reports.totalInboundCallDuration += item.call_duration
            }else {
              reports.outbound++
              reports.outboundCallTime[hour]++
              reports.totalOutboundCallDuration += item.call_duration
            }
            if (item.call_action == "Connected")
              reports.connected++
            else if (item.call_action == "Cancelled")
              reports.cancelled++
            else if (item.call_action == "Voicemail"){
              reports.voicemail++
              reports.voicemailTime[hour]++
            }else if (item.call_action == "Missed Call"){
              reports.missedCall++
              reports.missedCallTime[hour]++
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
            if (tempTime > reports.longestTalkTime)
              reports.longestTalkTime = tempTime

            if (item.call_hold_duration > reports.longestHoldTime)
              reports.longestHoldTime = item.call_hold_duration

            //reports.averageHoldTime: 0
          }
        }
        //console.log(reports.averageRespondTime)
        reports.averageRespondTime /= reports.inbound
        //console.log(reports)
        var response = {
            status: "ok",
            data: reports
          }
        res.send(response)
      });
    },
    */
    checkSubscription: function(){
      readAllRegisteredWebHookSubscriptions()
    }
};

module.exports = Account;

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
      var item = result.rows[0]
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

  var query = 'INSERT INTO ' +tableName+ ' (extension_id, added_timestamp, name, total_call_duration, total_call_respond_duration, inbound_calls, outbound_calls, missed_calls, voicemails)'
  query += " VALUES (" + extension.id
  query += "," + new Date().getTime()
  query += ",'" + extension.name
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
  //query += ' WHERE extension_id="'+extension.id+'"'

  pgdb.insert(query, [], (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("updateCallLogDb DONE");
    }
  })
}

function updateCallLogDb(accountId, extensionId, call){
  var tableName = "rt_call_logs_" + accountId

  var query = "INSERT INTO " + tableName
  query += " (session_id, extension_id, customer_number, agent_number, direction, calling_timestamp, "
  query += "call_duration, ringing_timestamp, connecting_timestamp, disconnecting_timestamp, holding_timestamp, call_hold_duration, "
  query += "holding_count, call_respond_duration, call_type, call_action, call_result)"
  query += " VALUES ('" + call.sessionId + "','"
  query += extensionId + "','"
  query += call.customerNumber + "','"
  query += call.agentNumber + "','"
  query += call.direction + "',"
  query += call.callingTimestamp + ","
  query += call.callDuration + ","
  query += call.ringingTimestamp + ","
  query += call.connectingTimestamp + ","
  query += call.disconnectingTimestamp + ","
  query += call.holdingTimestamp + ","
  query += call.callHoldDurationTotal + ","
  query += call.holdingCount + ","
  query += call.callRespondDuration + ",'"
  query += call.callType + "','"
  query += call.callAction + "','"
  query += call.callResult + "')"
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

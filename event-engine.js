const pgdb = require('./db')

function Account(accountId, subscriptionId){
  this.accountId = accountId
  this.subscriptionId = subscriptionId
  this.extensionList = []
  this.monitoredExtensionList = []
}

var engine = Account.prototype = {
    setup: async function(callback){
      var thisClass = this
      readAccountMonitoredExtensionsFromTable(this.accountId, (err, result) => {
        if ((!err))
          thisClass.monitoredExtensionList = result
        console.log("Done engine setup")
        callback(null, "Done engine setup")
      })
      /*
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
          result.rows.sort(sortByAddedDate)
          for (var ext of result.rows){
            var extension = {
              id: ext.extension_id,
              name: ext.name.trim(),
              callStatistics: {
                totalCallDuration: parseInt(ext.total_call_duration),
                totalCallRespondDuration: parseInt(ext.total_call_respond_duration),
                inboundCalls: parseInt(ext.inbound_calls),
                outboundCalls: parseInt(ext.outbound_calls),
                missedCalls: parseInt(ext.missed_calls),
                voicemails: parseInt(ext.voicemails)
              },
              activeCalls: []
            }
            thisClass.monitoredExtensionList.push(extension)
          }
        }
        console.log("Done autosetup")
        callback(null, "Done engine setup")
      });
      */
    },
    /*
    readAccountExtensionsFromTable: function(callback){
      console.log("readAccountExtensionsFromTable")
      var tableName = "rt_extensions_" + this.accountId
      var query = "SELECT * FROM " + tableName
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
          console.log(thisClass.extensionList.length)
          callback (null, "Done readAccountExtensionsFromTable")
        }
      });
    },
    */
    removeAccountMonitoredExtension: function(extId){
      var index = this.monitoredExtensionList.findIndex(o => o.id.toString() === extId.toString())
      if (index >= 0)
        this.monitoredExtensionList.splice(index, 1)
      /*
      for (var i=0; i< this.monitoredExtensionList.length; i++){
        var extension = this.monitoredExtensionList[i]
        if (extension.id == id){
          this.monitoredExtensionList.splice(i, 1)
          break
        }
      }
      */
    },
    processNotification: function(jsonObj){
      console.log("+++++++++++ NEW EVENT ++++++++++++")
      //console.log(JSON.stringify(jsonObj))
      //console.log("+++++++++++ ========= ++++++++++++")
      // parse tel notification payload
      if (this.monitoredExtensionList.length){
        for (var party of jsonObj.body.parties){
          if (party.extensionId){
            var extension = this.monitoredExtensionList.find(o => o.id === party.extensionId);
            if (extension){
              console.log("Extension Id:" + party.extensionId)
              console.log("Code: " + party.status.code)
              console.log("Time: " + jsonObj.body.eventTime)
              if (extension.activeCalls.length){
                console.log("HAS ACTIVE CALL")
                console.log("=======")
                for (var n=0; n < extension.activeCalls.length; n++){
                  var call = extension.activeCalls[n]
                  // match call party ids
                  if (call.partyId == party.id){
                    // check call party call's status
                    if(party.status.code == "Setup"){
                      if (call.status == "RINGING") { // most probably a disorder sequence
                        call.callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                      }
                    }else if (party.status.code == "Proceeding"){
                      call.ringingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                      call.localRingingTimestamp = new Date().getTime()
                      call.status = "RINGING"
                    }else if(party.status.code == "Answered"){
                      if (call.status == "HOLD"){
                        var timeNow = new Date(jsonObj.body.eventTime).getTime()
                        timeNow = Math.round((timeNow - call.holdingTimestamp) / 1000)
                        call.callHoldDurationTotal += timeNow
                      }else{
                        call.connectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                        call.localConnectingTimestamp = new Date().getTime()
                        if (call.direction == "Inbound" && call.status == "RINGING"){
                          var respondTime = (call.connectingTimestamp - call.ringingTimestamp) / 1000
                          call.callRespondDuration = Math.round(respondTime)
                          extension.callStatistics.totalcallRespondDuration += call.callRespondDuration
                        }
                      }
                      call.status = "CONNECTED"
                    }else if(party.status.code == "Disconnected"){
                      if (call.status == "NO-CALL"){
                        console.log("Return from here")
                        return
                      }
                      call.disconnectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                      this.handleDisconnection(extension, call)
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

                    }
                    // check call direction
                    if (party.direction == "Inbound"){
                      if (party.from)
                        call.customerNumber = party.from.phoneNumber
                      else
                        call.customerNumber = "Anonymous"
                      if (party.to)
                        call.agentNumber = party.to.phoneNumber
                      else
                        call.agentNumber = "Unknown"
                    }else{ // outbound
                      call.customerNumber = party.to.phoneNumber
                      call.agentNumber = party.from.phoneNumber
                    }
                    break // party id found => processed and done
                  }
                }
                // new call => multiple calls
                if (n >= extension.activeCalls.length){
                  console.log("another active call")
                  if (extension.activeCalls[0].status == "NO-CALL"){
                    console.log("replace old inactive call")
                    extension.activeCalls[0] = this.createNewActiveCall(jsonObj, party)
                  }else{
                    // IGNORE for now
                    //var activeCall = this.createNewActiveCall(jsonObj, party)
                    //extension.activeCalls.push(activeCall)
                  }
                  break
                }
              }else{
                console.log("NEW CALL")
                console.log("=======")
                // create new active call obj
                var activeCall = this.createNewActiveCall(jsonObj, party)
                extension.activeCalls.push(activeCall)
              }
            }
          }else{ // no extension id from the party
            console.log("Notification payload has no extension id from party obj")
            console.log("Code: " + party.status.code)
            console.log("Time: " + jsonObj.body.eventTime)
            console.log("=======")
            for (var extension of this.monitoredExtensionList){
              /*  rely on party id? */
              //var call = extension.activeCalls.find(o => o.partyId === party.id)
              /*  rely on party session id? */
              //for (var call of extension.activeCalls){
              var call = extension.activeCalls.find(o => o.sessionId === jsonObj.body.sessionId)
                //if (call.sessionId == jsonObj.body.sessionId){
                if (call != undefined){
                  if (party.status.code == "Disconnected"){
                    console.log("Call current STATUS:" + call.status)
                    if (call.status == "HOLD") {
                      call.disconnectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                      console.log("CUSTOMER hangs up during on hold")
                      call.callResult = "Customer hanged up during on-hold."
                      //this.handleDisconnection(extension, call, true)
                      break
                      //break
                    }else if (call.status == "CONNECTED"){
                      console.log("CUSTOMER hangs up")
                      call.callResult = "Customer hanged up."
                      break
                      //break
                    }
                  }else if(party.status.code == "Parked"){
                    call.status = "PARKED"
                    if (party.park.id)
                      call.parkNumber = party.park.id
                    console.log("Parked: " + jsonObj.body.eventTime)
                    //call.callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                  }
                }
              //}
            }
          }
        }
      }else{
        // empty monitoring list
        console.log("No extension on the monitoring list")
      }
    },
    handleDisconnection: function(extension, call){
      if (call.connectingTimestamp > 0){
        call.callDuration = Math.round((call.disconnectingTimestamp - call.connectingTimestamp) / 1000)
        extension.callStatistics.totalCallDuration += call.callDuration
      }
      if (call.direction == "Inbound"){
        extension.callStatistics.inboundCalls++
      }else {
        extension.callStatistics.outboundCalls++
      }

      if (call.status == "CONNECTED"){ // call terminated
        if(call.callResult == ""){
          console.log("AGENT hangs up")
          call.callResult = "Agent hanged up."
        }
        call.callAction = "Connected"
      }else if (call.status == "RINGING"){ // missed call
        console.log("Missed call detected by call status.")
        extension.callStatistics.missedCalls++
        call.callResult = "Missed call."
        call.callAction = "Missed Call"
      }else if (call.status == "HOLD"){ // transfered or disconnected
        if(call.callResult == ""){
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
      updateCallReportTable(this.accountId, extension.id, call)
      updateAnalyticsTable(this.accountId, extension)
    },
    createNewActiveCall: function (jsonObj, party) {
      // dealing with sequence out of order
      var status = ""
      var startTime = ""
      var ringingTimestamp= 0
      var connectingTimestamp= 0
      var disconnectingTimestamp= 0
      var callingTimestamp = 0
      if (party.status.code == "Setup"){
        callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
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
                partyId: party.id,
                customerNumber: "",
                agentNumber: "",
                status: status,
                direction: party.direction,
                callingTimestamp: callingTimestamp,
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
    }
};

module.exports = Account;

function sortCallTime(a, b){
  return b.calling_timestamp - a.calling_timestamp
}

function updateAnalyticsTable(accountId, extension){
  var tableName = "rt_analytics_" + accountId

  var query = 'INSERT INTO ' +tableName+ ' (extension_id, added_timestamp, name, total_call_duration, total_call_respond_duration, inbound_calls, outbound_calls, missed_calls, voicemails)'
  query += " VALUES ('" + extension.id
  query += "'," + new Date().getTime()
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
      console.log("updateAnalyticsTable DONE");
    }
  })
}

function updateCallReportTable(accountId, extensionId, call){
  var tableName = "rt_call_logs_" + accountId

  var query = "INSERT INTO " + tableName
  query += " (party_id, session_id, extension_id, customer_number, agent_number, direction, calling_timestamp, "
  query += "call_duration, ringing_timestamp, connecting_timestamp, disconnecting_timestamp, holding_timestamp, call_hold_duration, "
  query += "holding_count, call_respond_duration, call_type, call_action, call_result)"
  query += " VALUES ('" + call.partyId + "','"
  query += call.sessionId + "','"
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
  //console.log(query)

  pgdb.insert(query, [], (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("updateCallReportTable DONE");
    }
  })
}

function readAccountMonitoredExtensionsFromTable(accountId, callback){
  var tableName = "rt_analytics_" + accountId
  var query = "SELECT * FROM " + tableName
  var monitoredExtensionList = []
  pgdb.read(query, (err, result) => {
    if (err){
      console.error(err.message);
      callback(err.message, "error")
    }
    if (result.rows){
      result.rows.sort(sortByAddedDate)
      for (var ext of result.rows){
        var extension = {
          id: ext.extension_id,
          name: ext.name.trim(),
          callStatistics: {
            totalCallDuration: parseInt(ext.total_call_duration),
            totalCallRespondDuration: parseInt(ext.total_call_respond_duration),
            inboundCalls: parseInt(ext.inbound_calls),
            outboundCalls: parseInt(ext.outbound_calls),
            missedCalls: parseInt(ext.missed_calls),
            voicemails: parseInt(ext.voicemails)
          },
          activeCalls: []
        }
        monitoredExtensionList.push(extension)
      }
    }
    console.log("Done autosetup")
    callback(null, monitoredExtensionList)
  });
}

function sortByAddedDate(a, b){
  return b.added_timestamp - a.added_timestamp
}

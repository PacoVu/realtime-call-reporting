const sqlite3 = require('sqlite3').verbose();
var CALLREPORTING_DATABASE = './db/callreporting.db';

function EventHandler(accountId, extensionList){
  this.accountId = accountId
  this.monitoredExtensionList = []
  for (var ext of extensionList){
    var extension = {
      id: ext.id,
      name: ext.name,
      activeCalls: []
    }
    this.monitoredExtensionList.push(extension)
  }
}

var engine = EventHandler.prototype = {
  processNotification: function(jsonObj){
    // parse tel notification payload
    if (this.monitoredExtensionList.length){
      var party = jsonObj.body.parties[0]
      if (party.extensionId){
        var extension = this.monitoredExtensionList.find(o => o.id === party.extensionId);
        if (extension){
          if (extension.activeCalls.length){
            console.log("HAS ACTIVE CALL")
            console.log("=======")
            var call = extension.activeCalls.find(o => o.partyId === party.id)
            if (call){
              // check call party call's status
              if(party.status.code == "Setup"){
                if (call.status == "RINGING") { // most probably a disorder sequence
                  call.callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                }
              }else if (party.status.code == "Proceeding"){
                call.ringingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                call.localRingingTimestamp = new Date().getTime()
                call.status = "RINGING"
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
                  }
                }
                call.status = "CONNECTED"
              }else if(party.status.code == "Disconnected"){
                console.log("Agent disconnected event")
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
              }
            }else{
              var index = extension.activeCalls.findIndex(o => o.status === "NO-CALL")
              if (index >= 0){
                console.log("Reuse old active call")
                extension.activeCalls[index] = this.createNewActiveCall(jsonObj, party)
                console.log(extension.activeCalls.length)
              }else{
                console.log("Add new active call")
                extension.activeCalls.push(this.createNewActiveCall(jsonObj, party))
                console.log(extension.activeCalls.length)
              }
            }
          }else{
            // create new active call obj
            var activeCall = this.createNewActiveCall(jsonObj, party)
            extension.activeCalls.push(activeCall)
          }
        }
      }else{ // no extension id from the party
        console.log("Notification payload has no extension id from party obj")
        for (var extension of this.monitoredExtensionList){
          var call = extension.activeCalls.find(o => o.sessionId === jsonObj.body.sessionId)
          if (call != undefined){
            if (party.status.code == "Disconnected"){
              if (call.status == "HOLD") {
                call.disconnectingTimestamp = new Date(jsonObj.body.eventTime).getTime()
                call.callResult = "Customer hanged up during on-hold."
                //this.handleDisconnection(extension, call, true)
                break
              }else if (call.status == "CONNECTED"){
                console.log("CUSTOMER hangs up")
                call.callResult = "Customer hanged up."
                break
              }
            }else if(party.status.code == "Parked"){
              call.status = "PARKED"
              if (party.park.id)
                call.parkNumber = party.park.id
            }
          }
        }
      }
    }else{
      // empty monitoring list
      console.log("No extension on the monitoring list")
    }
  },
  handleDisconnection: function(extension, call){
    if (call.status == "CONNECTED"){ // call was connected
      if(call.callResult == ""){
        console.log("AGENT hangs up")
        call.callResult = "Agent hanged up."
      }
      call.callAction = "Connected"
    }else if (call.status == "RINGING"){ // missed call
      console.log("Missed call detected by call status.")
      call.callResult = "Missed call."
      call.callAction = "Missed Call"
    }else if (call.status == "HOLD"){ // transfered or disconnected
      if(call.callResult == ""){
        call.callResult = "Agent hanged up during on-hold."
      }
      call.callHoldDurationTotal += (call.disconnectingTimestamp - call.holdingTimestamp) / 1000
    }else if (call.status == "VOICEMAIL"){ // to voicemail
      call.callResult = "Voicemail."
      call.callAction = "Voicemail"
    }else if (call.status == "SETUP"){
      call.callAction = "Cancelled"
      call.callResult = "Call was cancelled"
    }else if (call.status == "PARKED"){
      call.callAction = "Parked"
      call.callResult = "Call was parked."
    }else{
      call.callAction = call.status
      call.callResult = "Unknown call status"
    }
    call.status = "NO-CALL"
    updateCallReportTable(this.accountId, extension.id, extension.name, call)
  },
  createNewActiveCall: function (jsonObj, party) {
    // dealing with sequence out of order
    var status = ""
    var startTime = ""
    var ringingTimestamp= 0
    var connectingTimestamp= 0
    var disconnectingTimestamp= 0
    var callingTimestamp = 0
    var customerNumber = ""
    var agentNumber = ""
    var type = ""
    // detect call type from call queue
    if (party.uiCallInfo){
      if (party.uiCallInfo.primary.type  == "QueueName")
        type = "Queue"
      else
        type = party.uiCallInfo.primary.type
    }else{
      type = jsonObj.body.origin.type
    }
    if (party.status.code == "Setup"){
      callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
      status = "SETUP"
    }else if (party.status.code == "Proceeding"){
      // This happens when there is an incoming call to a call queue
      // Have to deal with call from call queue, where queue members do not receive own setup event!!!

      // set callingTimestamp with ringingTimestamp for just in case there is no callingTimestamp
      callingTimestamp = new Date(jsonObj.body.eventTime).getTime()
      // search for callingTimestamp from an active call with the same sessionId
      for (var ext of this.monitoredExtensionList){
        for (call of ext.activeCalls){
          if (jsonObj.body.sessionId == call.sessionId){
            callingTimestamp = call.callingTimestamp
            break
            break
          }
        }
      }
      ringingTimestamp = new Date(jsonObj.body.eventTime).getTime()
      status = "RINGING"
      // check call direction
      if (party.direction == "Inbound"){
        if (party.from)
          customerNumber = party.from.phoneNumber
        else
          customerNumber = "Anonymous"
        if (party.to)
          agentNumber = party.to.phoneNumber
        else
          agentNumber = "Unknown"
      }else{ // outbound
        customerNumber = party.to.phoneNumber
        agentNumber = party.from.phoneNumber
      }
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
                customerNumber: customerNumber,
                agentNumber: agentNumber,
                status: status,
                direction: party.direction,
                callingTimestamp: callingTimestamp,
                ringingTimestamp: ringingTimestamp,
                connectingTimestamp: connectingTimestamp,
                disconnectingTimestamp: disconnectingTimestamp,
                holdingTimestamp: 0,
                callHoldDurationTotal: 0,
                holdingCount: 0,
                callType: type,
                callAction: "",
                callResult: "",
                parkNumber: "",
                localRingingTimestamp: 0,
                localConnectingTimestamp: 0,
                localHoldingTimestamp: 0,
                talkDuration: 0,
                callRespondDuration: 0,
                callHoldDuration: 0
              }
    return activeCall
  }
};

module.exports = EventHandler;

function updateCallReportTable(accountId, extensionId, extensionName, call){
  let db = new sqlite3.Database(CALLREPORTING_DATABASE);
  var tableName = "call_report_logs_" + accountId
  var query = "INSERT OR IGNORE INTO " + tableName
  query += " (party_id, session_id, extension_id, extension_name, customer_number, agent_number, direction, calling_timestamp, "
  query += "ringing_timestamp, connecting_timestamp, disconnecting_timestamp, holding_timestamp, call_hold_duration, "
  query += "holding_count, call_type, call_action, call_result)"
  query += " VALUES ('" + call.partyId + "',"
  query += "'" + call.sessionId + "',"
  query += "'" + extensionId + "',"
  query += "'" + extensionName + "',"
  query += "'" + call.customerNumber + "',"
  query += "'" + call.agentNumber + "',"
  query += "'" + call.direction + "',"
  query += call.callingTimestamp + ","
  query += call.ringingTimestamp + ","
  query += call.connectingTimestamp + ","
  query += call.disconnectingTimestamp + ","
  query += call.holdingTimestamp + ","
  query += call.callHoldDurationTotal + ","
  query += call.holdingCount + ","
  query += "'" + call.callType + "',"
  query += "'" + call.callAction + "',"
  query += "'" + call.callResult + "')"

  db.run(query, function(err, result) {
    if (err){
      console.error(err.message);
    }else{
      console.log("updateCallReportTable DONE");
    }
  });
}

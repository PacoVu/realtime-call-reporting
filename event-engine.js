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
    var party = jsonObj.body.parties[0]
    if (party.extensionId){
      var extension = this.monitoredExtensionList.find(o => o.id === party.extensionId);
      if (extension){
        var call = extension.activeCalls.find(o => o.partyId === party.id)
        if (call){
          // check call party call's status
          var timestamp = new Date(jsonObj.body.eventTime).getTime()
          if(party.status.code == "Setup"){
            if (call.status == "RINGING"){ // most probably a disorder sequence
              call.callTimestamp = timestamp
            }
          }else if (party.status.code == "Proceeding"){
            call.ringTimestamp = timestamp
            call.localRingTimestamp = new Date().getTime()
            call.status = "RINGING"
            if (party.direction == "Inbound"){
              if (party.from)
                call.customerNumber = party.from.phoneNumber
              if (party.to)
                call.agentNumber = party.to.phoneNumber
            }else{ // outbound
              call.customerNumber = party.to.phoneNumber
              call.agentNumber = party.from.phoneNumber
            }
          }else if(party.status.code == "Answered"){
            if (call.status == "HOLD"){
              var holdDuration = Math.round((timestamp - call.holdTimestamp) / 1000)
              call.callHoldDurationTotal += holdDuration
            }else{
              call.connectTimestamp = timestamp
              call.localConnectTimestamp = new Date().getTime()
              if (call.direction == "Inbound" && call.status == "RINGING"){
                var respondTime = (call.connectTimestamp - call.ringTimestamp) / 1000
                call.callRingDuration = Math.round(respondTime)
              }
            }
            if (party.direction == "Inbound"){
              if (party.from)
                call.customerNumber = party.from.phoneNumber
              if (party.to)
                call.agentNumber = party.to.phoneNumber
            }else{ // outbound
              call.customerNumber = party.to.phoneNumber
              call.agentNumber = party.from.phoneNumber
            }
            call.status = "CONNECTED"
          }else if(party.status.code == "Disconnected"){
            console.log("Agent's disconnected event")
            if (call.status == "NO-CALL"){
              console.log("Already handled disconnection when customer hanged up => return")
              return
            }
            call.disconnectTimestamp = timestamp
            this.handleDisconnection(extension, call, agentHangedup=true)
          }else if(party.status.code == "Voicemail"){
            call.status = "VOICEMAIL"
          }else if(party.status.code == "Hold"){
            call.holdTimestamp = timestamp
            call.localHoldTimestamp = new Date().getTime()
            call.status = "HOLD"
            call.holdCount++
          }
        }else{
          var index = extension.activeCalls.findIndex(o => o.status === "NO-CALL")
          if (index >= 0){
            console.log("Reuse old active call")
            extension.activeCalls[index] = this.createNewActiveCall(jsonObj, party)
            console.log(extension.activeCalls.length)
          }else{
            console.log("Add new active call")
            var activeCall = this.createNewActiveCall(jsonObj, party)
            extension.activeCalls.push(activeCall)
            console.log(extension.activeCalls.length)
          }
        }
      }else{
        console.log("This extension was not added to the monitored extension list")
      }
    }else{ // no extension id from the party
      for (var extension of this.monitoredExtensionList){
        var call = extension.activeCalls.find(o => o.sessionId === jsonObj.body.sessionId)
        if (call != undefined){
          if (party.status.code == "Disconnected"){
            if (call.status == "NO-CALL"){
              console.log("Already handled disconnection when agent hanged up => return")
              return
            }
            call.disconnectTimestamp = new Date(jsonObj.body.eventTime).getTime()
            this.handleDisconnection(extension, call, agentHangedup=false)
            break
          }else if(party.status.code == "Parked"){
            call.status = "PARKED"
            if (party.park.id)
              call.parkNumber = party.park.id
          }
        }
      }
    }
  },
  createNewActiveCall: function (jsonObj, party) {
    var call = {
                sessionId: jsonObj.body.sessionId,
                partyId: party.id,
                customerNumber: "Anonymous",
                agentNumber: "Unknown",
                status: "NO-CALL",
                direction: party.direction,
                callTimestamp: 0,
                ringTimestamp: 0,
                connectTimestamp: 0,
                disconnectTimestamp: 0,
                holdTimestamp: 0,
                callHoldDurationTotal: 0,
                holdCount: 0,
                callType: "",
                callAction: "",
                callResult: "",
                parkNumber: "",
                localRingTimestamp: 0,
                localConnectTimestamp: 0,
                localHoldTimestamp: 0,
                talkDuration: 0,
                callRingDuration: 0,
                callHoldDuration: 0
              }
    var timestamp = new Date(jsonObj.body.eventTime).getTime()
    if (party.status.code == "Setup"){
      call.callTimestamp = timestamp
      call.status = "SETUP"
    }else if (party.status.code == "Proceeding"){
      // This happens when there is an incoming call to a call queue
      // Need to deal with incoming calls to a call queue, where queue's members do not receive their own setup event!!!
      // Set default callTimestamp with ringTimestamp for just in case there was no setup event
      call.callTimestamp = timestamp
      // get callTimestamp from an active call with the same sessionId
      for (var ext of this.monitoredExtensionList){
        for (c of ext.activeCalls){
          if (jsonObj.body.sessionId == c.sessionId){
            call.callTimestamp = c.callTimestamp
            break
            break
          }
        }
      }
      call.ringTimestamp = timestamp
      call.status = "RINGING"
      if (party.direction == "Inbound"){
        if (party.from)
          call.customerNumber = party.from.phoneNumber
        if (party.to)
          call.agentNumber = party.to.phoneNumber
      }else{ // outbound
        call.customerNumber = party.to.phoneNumber
        call.agentNumber = party.from.phoneNumber
      }
    }else if (party.status.code == "Answered"){
      call.connectTimestamp = timestamp
      call.status = "CONNECTED"
      if (party.direction == "Inbound"){
        if (party.from)
          call.customerNumber = party.from.phoneNumber
        if (party.to)
          call.agentNumber = party.to.phoneNumber
      }else{ // outbound
        call.customerNumber = party.to.phoneNumber
        call.agentNumber = party.from.phoneNumber
      }
    }else if (party.status.code == "Disconnected"){
      call.disconnectTimestamp = timestamp
      call.status = "NO-CALL"
    }
    // detect call type from call queue
    call.callType = jsonObj.body.origin.type
    if (party.uiCallInfo) // override callType if this call is from a call queue
      if (party.uiCallInfo.primary.type  == "QueueName")
        call.callType = "Queue"

    return call
  },
  handleDisconnection: function(extension, call, agentHangedup){
    if (call.status == "CONNECTED"){ // call was connected
      if(agentHangedup)
        call.callResult = "Agent hanged up."
      else
        call.callResult = "Customer hanged up."
      call.callAction = "Connected"
    }else if (call.status == "HOLD"){
      if(agentHangedup)
        call.callResult = "Agent hanged up during on-hold."
      else
        call.callResult = "Customer hanged up during on-hold."
      call.callAction = "Connected"
      call.callHoldDurationTotal += (call.disconnectTimestamp - call.holdTimestamp) / 1000
    }else if (call.status == "RINGING"){ // missed call
      call.callResult = "Missed call."
      call.callAction = "Missed Call"
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
      call.callAction = "Unknown"
      call.callResult = "Unknown call result."
    }
    call.status = "NO-CALL"
    this.updateCallReportTable(extension.id, extension.name, call)
  },
  updateCallReportTable: function(extensionId, extensionName, call){
    let db = new sqlite3.Database(CALLREPORTING_DATABASE);
    var tableName = "call_report_logs_" + this.accountId
    var query = "INSERT OR IGNORE INTO " + tableName
    query += " (party_id, session_id, extension_id, extension_name, customer_number, agent_number, direction, call_timestamp, "
    query += "ring_timestamp, connect_timestamp, disconnect_timestamp, call_hold_duration, "
    query += "hold_count, call_type, call_action, call_result)"
    query += " VALUES ('" + call.partyId + "',"
    query += "'" + call.sessionId + "',"
    query += "'" + extensionId + "',"
    query += "'" + extensionName + "',"
    query += "'" + call.customerNumber + "',"
    query += "'" + call.agentNumber + "',"
    query += "'" + call.direction + "',"
    query += call.callTimestamp + ","
    query += call.ringTimestamp + ","
    query += call.connectTimestamp + ","
    query += call.disconnectTimestamp + ","
    query += call.callHoldDurationTotal + ","
    query += call.holdCount + ","
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
};

module.exports = EventHandler;

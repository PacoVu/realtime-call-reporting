var activeCallsList = []
var timeOffset = 0

function init(){
  var height = $("#menu_header").height()
  height += $("#footer").height()
  var h = $(window).height() - (height + 90);
  $("#extension_list").height(h)

  window.onresize = function() {
    var height = $("#menu_header").height()
    height += $("#footer").height()
    var h = $(window).height() - (height + 90);
    $("#extension_list").height(h)
  }
  timeOffset = new Date().getTimezoneOffset()*60000;
  pollResult()
}

function updateSummary(total, ringing, connected, hold, voicemail){
  var html = "<span class='title center'>Summary: </span><img src='img/agent.png'/><b> #: " + total
  var idle = total - (ringing + connected + hold + voicemail)
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/NO-CALL.png'/><b> #: " + idle + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/RINGING.png'/><b> #: " + ringing + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/CONNECTED.png'/><b> #: " + connected + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/HOLD.png'/><b> #: " + hold + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/VOICEMAIL.png'/><b> #: " + voicemail + "</b>"
  $("#summary").html(html)
}

function pollResult(){
  var url = "poll_calls"
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok") {
      if (res.data.length){
        var ringing = 0
        var connected = 0
        var hold = 0
        var voicemail = 0
        for (var extension of res.data){
          if (extension.activeCalls.length){
            var activeCall = activeCallsList.find(a => a.id === extension.id)
            if (activeCall != undefined){
              var callExist = false
              for (var call of extension.activeCalls){
                var updateCall = activeCallsList.find(a => a.partyId === call.partyId)
                if (updateCall != undefined){
                  if (call.status == "NO-CALL"){
                    $("#title_"+call.partyId).html("Latest call stats")
                    var html = `<div class='col-sm-4'><b>${name}</b></div>`
                    $('#stats_'+call.partyId).append(html);
                    $("#active_calls_"+call.partyId).empty()
                    $("#active_calls_"+call.partyId).append(makeActiveCallBlock(call))
                    var n = activeCallsList.findIndex(o => o.partyId === call.partyId)
                    if (n>=0){
                      activeCallsList[n].displayCount--
                      if (activeCallsList[n].displayCount <= 0){
                        activeCallsList.splice(n, 1)
                        $("#extension_"+call.partyId).remove()
                      }
                    }
                  }else if(call.status == "SETUP"){
                    if ($("#active_calls_"+call.partyId).length == 0)
                      $("#active_calls_"+call.partyId).append(makeActiveCallBlock(call))
                  }else{
                    if(call.status == "RINGING")
                      ringing++
                    else if(call.status == "CONNECTED")
                      connected++
                    else if(call.status == "HOLD")
                      hold++
                    else if(call.status == "VOICEMAIL")
                      voicemail++
                    $("#title_"+call.partyId).html("Active call stats")
                    $("#active_calls_"+call.partyId).empty()
                    $("#active_calls_"+call.partyId).append(makeActiveCallBlock(call))
                  }
                }else{
                  if (call.status != "NO-CALL"){
                    var agent = {
                      id: extension.id,
                      partyId: call.partyId,
                      name: extension.name,
                      displayCount: 5
                    }
                    makeAgentCallBlock(agent, call)
                  }
                }
              }
            }else{
              for (var call of extension.activeCalls){
                // new active agent => add to the dashboard
                if (call.status != "NO-CALL"){
                  var agent = {
                    id: extension.id,
                    partyId: call.partyId,
                    name: extension.name,
                    displayCount: 5
                  }
                  makeAgentCallBlock(agent, call)
                }
              }
            }
          }
        }
        updateSummary(res.data.length, ringing, connected, hold, voicemail)
      }
      window.setTimeout(function(){
          pollResult()
      }, 1000)
    }else{
      alert("err")
    }
  });
}

function makeActiveCallBlock(call){
    var startTime = new Date(call.callTimestamp - timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0]
    var html = `<div id='call_${call.partyId}' class='col-sm-6'>`
    var icon = (call.direction == "Inbound") ? "IN-CALL.png" : "OUT-CALL.png"
    html += `<div class='col-sm-4 center'><img src='img/${icon}'/> Call Start: ${startTime}</div>`
    if (call.direction == "Inbound"){
      html += `<div class='col-sm-4 center'>From: ${formatPhoneNumber(call.customerNumber)}</div>`
      html += `<div class='col-sm-4 center'>To: ${formatPhoneNumber(call.agentNumber)} </div>`
    }else{
      html += `<div class='col-sm-4 center'>From: ${formatPhoneNumber(call.agentNumber)}</div>`
      html += `<div class='col-sm-4 center'>To: ${formatPhoneNumber(call.customerNumber)} </div>`
    }
    if (call.status == "NO-CALL"){
      html += `<div class='col-sm-4 center'>Result: ${call.callResult}</div>`
    }
    html += `</div>`
    html += `<div class='col-sm-4'>`
    if (call.status == "RINGING")
      html += `<div class='col-sm-4 center'>Ring Time: ${formatDurationTime(call.callRingDuration)}</div>`
    else
      html += `<div class='col-sm-4 center'>Respond Time: ${formatDurationTime(call.callRingDuration)}</div>`
    html += `<div class='col-sm-4 center'>Talk Time: ${formatDurationTime(call.talkDuration)}</div>`
    html += `<div class='col-sm-4 center'>Hold Time: ${formatDurationTime(call.callHoldDuration)}</div>`
    if (call.status == "NO-CALL"){
      if (call.parkNumber != "")
        html += `<div class='col-sm-4 center'>Park #: ${call.parkNumber}</div>`
    }
    html += `</div>`

    html += `<div class='col-sm-2'>`
    html += `<img src='img/${call.status}.png'>`
    html += `</div>`

    return html
}

function makeAgentCallBlock(agent, call){
  activeCallsList.push(agent)
  var html = `<div id="extension_${call.partyId}" class='col-sm-3 phone-block'>`
  html += `<div id="stats_${call.partyId}" class='col-xs-12 stats'>`
  html += `<div class='col-sm-4'><b>${agent.name}</b></div>`
  html += `</div>`
  // title line
  html += `<div id="title_${agent.partyId}" class='col-xs-12 call-title'>Active call stats</div>`
  // active call block
  html += `<div id="active_calls_${call.partyId}" class='col-xs-12 active-calls'>`
  html += makeActiveCallBlock(call)
  html += `</div>`
  $('#extension_list').append(html);
}

function formatDurationTime(dur){
  dur = Math.round(dur)
  if (dur > 86400) {
    var d = Math.floor(dur / 86400)
    dur = dur % 86400
    var h = Math.floor(dur / 3600)
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    var s = dur % 60
    return d + "d " + h + "h " + m + "m " + s + "s"
  }else if (dur >= 3600){
    var h = Math.floor(dur / 3600)
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    var s = dur % 60
    return h + "h " + m + "m " + s + "s"
  }else if (dur >= 60){
    var m = Math.floor(dur / 60)
    var s = dur % 60
    return m + "m " + s + "s"
  }else{
    return dur + "s"
  }
}

function formatPhoneNumber(phoneNumberString) {
  var cleaned = ('' + phoneNumberString).replace(/\D/g, '')
  var match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/)
  if (match) {
    var intlCode = (match[1] ? '+1 ' : '')
    return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('')
  }
  return phoneNumberString
}

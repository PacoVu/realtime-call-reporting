var activeAgentList = []
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

function updateSummary(total, ringing, connected, hold){
  var html = "<span class='title center'>Summary: </span><img src='img/agent.png'/><b> #: " + total
  var idle = total - (ringing + connected + hold)
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/NO-CALL.png'/><b> #: " + idle + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/RINGING.png'/><b> #: " + ringing + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/CONNECTED.png'/><b> #: " + connected + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/HOLD.png'/><b> #: " + hold + "</b>"
  //html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/PARKED.png'/><b> #: " + hold + "</b>"
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
        for (var extension of res.data){
          if (extension.activeCalls.length){
            var agent = activeAgentList.find(a => a.id === extension.id)
            if (agent != undefined){
              for (var call of extension.activeCalls){
                if (call.status == "NO-CALL"){
                  var stats = extension.callStatistics
                  $("#title_"+extension.id).html("Latest call stats")
                  $("#stats_"+extension.id).empty()
                  var html = makeCallsStatisticBlock(extension.name, stats)
                  $('#stats_'+extension.id).append(html);
                  $("#active_calls_"+extension.id).empty()
                  $("#active_calls_"+extension.id).append(makeActiveCallBlock(call))
                  var n = activeAgentList.findIndex(o => o.id === extension.id)
                  if (n>=0){
                    activeAgentList[n].displayCount--
                    if (activeAgentList[n].displayCount <= 0){
                      activeAgentList.splice(n, 1)
                      $("#extension_"+extension.id).remove()
                    }
                  }
                }else if(call.status == "SETUP"){
                  if ($("#active_calls_"+extension.id).length == 0)
                    $("#active_calls_"+extension.id).append(makeActiveCallBlock(call))
                }else{
                  if(call.status == "RINGING")
                    ringing++
                  else if(call.status == "CONNECTED")
                    connected++
                  else if(call.status == "HOLD")
                    hold++
                  $("#title_"+extension.id).html("Active call stats")
                  $("#active_calls_"+extension.id).empty()
                  $("#active_calls_"+extension.id).append(makeActiveCallBlock(call))
                }
              }
            }else{
              if (extension.activeCalls.length && extension.activeCalls[0].status != "NO-CALL"){
                // new active agent => add to the dashboard
                var agent = {
                  id: extension.id,
                  name: extension.name,
                  displayCount: 5
                }
                activeAgentList.push(agent)
                makeAgentCallBlock(extension)
              }
            }
          }
        }
        updateSummary(res.data.length, ringing, connected, hold)
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
    var startTime = new Date(call.callingTimestamp - timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0]
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
      html += `<div class='col-sm-4 center'>Ring Time: ${formatDurationTime(call.callRespondDuration)}</div>`
    else
      html += `<div class='col-sm-4 center'>Respond Time: ${formatDurationTime(call.callRespondDuration)}</div>`
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

function makeCallsStatisticBlock(name, stats){
  var html = `<div class='col-sm-4'><b>${name}</b></div>`
  html += `<div class='col-sm-2'><img src='img/IN-CALL.png'> ${stats.inboundCalls}</div>`
  html += `<div class='col-sm-2'><img src='img/OUT-CALL.png'> ${stats.outboundCalls}</div>`
  html += `<div class='col-sm-2'><img src='img/Missed.png'> ${stats.missedCalls}</div>`
  html += `<div class='col-sm-2'><img src='img/VM.png'> ${stats.voicemails}</div>`
  return html
}
function makeAgentCallBlock(ext){
  var stats = ext.callStatistics
  var html = `<div id="extension_${ext.id}" class='col-sm-3 phone-block'>`
  html += `<div id="stats_${ext.id}" class='col-xs-12 stats'>`
  html += makeCallsStatisticBlock(ext.name, stats)
  html += `</div>`
  // title line
  html += `<div id="title_${ext.id}" class='col-xs-12 call-title'>Active call stats</div>`
  // active call block
  html += `<div id="active_calls_${ext.id}" class='col-xs-12 active-calls'>`
  html += makeActiveCallBlock(ext.activeCalls[0])
  html += `</div>`
  $('#extension_list').append(html);
}

function logout(){
  window.location.href = "index?n=1"
}

function formatDurationTime(dur){
  dur = Math.round(dur)
  if (dur > 86400) {
    var d = Math.floor(dur / 86400)
    dur = dur % 86400
    var h = Math.floor(dur / 3600)
    //h = (h>9) ? h : "0" + h
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    //m = (m>9) ? m : ("0" + m)
    var s = dur % 60
    //var s = (dur>9) ? dur : ("0" + dur)
    return d + "d " + h + "h " + m + "m " + s + "s"
  }else if (dur >= 3600){
    var h = Math.floor(dur / 3600)
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    //m = (m>9) ? m : ("0" + m)
    var s = dur % 60
    //var s = (dur>9) ? dur : ("0" + dur)
    return h + "h " + m + "m " + s + "s"
  }else if (dur >= 60){
    var m = Math.floor(dur / 60)
    var s = dur % 60
    //var s = (dur>9) ? dur : ("0" + dur)
    return m + "m " + s + "s"
  }else{
    //var s = (dur>9) ? dur : ("0" + dur)
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

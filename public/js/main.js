//var canPoll = false
var agentList = []
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
  readExtensions()
  timeOffset = new Date().getTimezoneOffset()*60000;
  pollResult()
}

function updateSummary(total, ringing, connected, hold){
  var html = "<img src='img/agent.png'/><b> #: " + total
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/RINGING.png'/><b> #: " + ringing + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/CONNECTED.png'/><b> #: " + connected + "</b>"
  html += "&nbsp;&nbsp;&nbsp;&nbsp;<img src='img/HOLD.png'/><b> #: " + hold + "</b>"
  $("#summary").html(html)
}

function pollResult(){
  var url = "poll_calls"
  var getting = $.get( url );
  //canPoll = true
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
                  $("#title_"+extension.id).html("Last call stats")
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
                //alert(JSON.stringify(extension))
                var agent = {
                  id: extension.id,
                  name: extension.name,
                  displayCount: 3
                }
                activeAgentList.push(agent)
                makeAgentCallBlock(extension)
                //alert(JSON.stringify(activeAgentList))
              }
            }
          }else{
            // need to remove from dashboard
            var n = activeAgentList.findIndex(o => o.id === extension.id)
            if (n>=0){
              activeAgentList.splice(n, 1)
              $('#extension'+extension.id).remove()
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

function makeNoCallBlock(){
  var html = `<div class='col-sm-6'>`
  html += `<div class='col-sm-4 center'>Call Start: --</div>`
  html += `<div class='col-sm-4 center'>From: --</div>`
  html += `<div class='col-sm-4 center'>To: --</div>`
  //html += `<div class='col-sm-4 center'>Result: --</div>`
  html += `</div>`
  html += `<div class='col-sm-4'>`
  html += `<div class='col-sm-4 center'>Respond Time: --</div>`
  html += `<div class='col-sm-4 center'>Talk Time: --</div>`
  html += `<div class='col-sm-4 center'>Hold Time: --</div>`
  //html += `<div class='col-sm-4 center'>Park #: --</div>`
  html += `</div>`
  html += `<div class='col-sm-2'>`
  html += `<img class='icon' src='img/NO-CALL.png'>`
  html += `</div>`
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

function checkSubscription(){
  var url = "check_subscription"
  var getting = $.get( url );
  getting.done(function( res ) {

  })
}

function createAgentList() {
  var page = $("#pages").val()
  var ranges = page.split("-")
  $('#extensions').empty()
  var start = parseInt(ranges[0])
  var end = parseInt(ranges[1])
  //alert(end)
  for (var i=start; i<end; i++){
    ext = agentList[i]
    optionText = ext.name;
    optionValue = ext.id;
    $('#extensions').append(`<option value="${optionValue}"> ${optionText} </option>`);
  }
  $('#extensions').selectpicker('refresh');
}
function removeMonitoredExtension(id, name){
  $('#extensions').append(`<option value="${id}"> ${name} </option>`);
  $('#extensions').selectpicker('refresh');
  $("#extension_"+id).empty()
  var agent = {
    id: id,
    name: name
  }
  agentList.push(agent)
  var url = `remove_extension?id=${id}`
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok"){
      $("#extension_list").empty()
      for (var ext of res.data){
        if (ext.activeCalls.length){
          makeAgentCallBlock(ext)
        }
        /*
        var stats = ext.callStatistics
        var html = `<div id="extension_${ext.id}" class='col-sm-3 phone-block'>`
        html += `<img class="corner" src="./img/close.png" onclick="removeMonitoredExtension(${ext.id}, '${ext.name}')"></img>`
        // stats block
        html += `<div id="stats_${ext.id}" class='col-xs-12 stats'>`
        html += makeCallsStatisticBlock(ext.name, stats)
        html += `</div>`
        // title line
        html += `<div id="title_${ext.id}" class='col-xs-12 call-title'>Last call stats</div>`
        // active call block
        html += `<div id="active_calls_${ext.id}" class='col-xs-12 active-calls'>`
        if (ext.activeCalls.length)
          html += makeActiveCallBlock(ext.activeCalls[0])
        else
          html += makeNoCallBlock()
        html += `</div>`
        $('#extension_list').append(html);
        */
      }
    }
  })
}

function searchAgent(){
  var agentName = $("#search").val().toLowerCase()
  $('#extensions').empty()
  var foundList = []
  for (var agent of agentList){
    if (agent.name.toLowerCase().indexOf(agentName) >= 0){
      optionText = agent.name;
      optionValue = agent.id;
      $('#extensions').append(`<option value="${optionValue}"> ${optionText} </option>`);
    }
  }
}
function sortByName(a, b){
  if(a.name < b.name) { return -1; }
  if(a.name > b.name) { return 1; }
  return 0;
}
function readExtensions(){
  var url = "read_extensions"
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok"){
      agentList = res.extensions
      if (agentList.length){
        agentList.sort(sortByName)
        var perPage = 200
        var pages = Math.floor(agentList.length / perPage)
        var start = 0
        var end = 0
        for (var p=1; p<=pages; p++){
          end = (perPage*p)
          $('#pages').append(`<option value="${start + "-" + end}"> ${p} </option>`);
          start = end
        }
        var leftOver = agentList.length % perPage
        end += leftOver
        if (leftOver > 0){
          $('#pages').append(`<option value="${start + "-" + end}"> ${pages+1} </option>`);
        }
        $("#pages").prop("selectedIndex", 0).change()
      }
      res.data.sort(sortByName)
      activeAgentList = []
      for (var ext of res.data){
        if (ext.activeCalls.length && ext.activeCalls[0].status != "NO-CALL"){
          //var stats = ext.callStatistics
          var agent = {
            id: ext.id,
            name: ext.name,
            displayCount: 3
          }
          activeAgentList.push(agent)
          makeAgentCallBlock(ext)
          /*
          var html = `<div id="extension_${ext.id}" class='col-sm-3 phone-block'>`
          html += `<img class="corner" src="./img/close.png" onclick="removeMonitoredExtension(${ext.id}, '${ext.name}')"></img>`
          // stats block
          html += `<div id="stats_${ext.id}" class='col-xs-12 stats'>`
          html += makeCallsStatisticBlock(ext.name, stats)
          html += `</div>`
          // title line
          html += `<div id="title_${ext.id}" class='col-xs-12 call-title'>Last call stats</div>`
          // active call block
          html += `<div id="active_calls_${ext.id}" class='col-xs-12 active-calls'>`
          html += makeActiveCallBlock(ext.activeCalls[0])
          html += `</div>`
          $('#extension_list').append(html);
          */
        }
      }
    }
  });
}

function makeAgentCallBlock(ext){
  var stats = ext.callStatistics
  var html = `<div id="extension_${ext.id}" class='col-sm-3 phone-block'>`
  //html += `<img class="corner" src="./img/close.png" onclick="removeMonitoredExtension(${ext.id}, '${ext.name}')"></img>`
  // stats block
  html += `<div id="stats_${ext.id}" class='col-xs-12 stats'>`
  html += makeCallsStatisticBlock(ext.name, stats)
  html += `</div>`
  // title line
  html += `<div id="title_${ext.id}" class='col-xs-12 call-title'>Last call stats</div>`
  // active call block
  html += `<div id="active_calls_${ext.id}" class='col-xs-12 active-calls'>`
  html += makeActiveCallBlock(ext.activeCalls[0])
  html += `</div>`
  $('#extension_list').append(html);
}

function addExtension(){
  var extensionIds = $('#extensions').val()
  var extensionNames = $('#extensions option:selected').toArray().map(item => item.text).join();
  var extensionNameList = extensionNames.split(",")
  var extensionList = []
  for (var i=0; i<extensionIds.length; i++){
    var item = {
      id: extensionIds[i],
      name: extensionNameList[i]
    }
    extensionList.push(item)
    // remove from main agentList
    var n = agentList.findIndex(o => o.id === extensionIds[i])
    if (n>=0)
      agentList.splice(n, 1)
  }
  for (var ext of extensionIds){
    $('#extensions').find('[value=' + ext + ']').remove();
  }
  $('#extensions').selectpicker('refresh');
  //$('#extensions').selectpicker('hide');
  // or disable it
  //$('#extensions').prop('disabled', false);
  var url = `add_extensions`
  var data = {
    extensions: JSON.stringify(extensionList)
  }
  var posting = $.post( url, data );
  posting.done(function( res ) {
    if (res.status == "ok"){
      for (var ext of res.data){
        if (ext.activeCalls.length){
          //var stats = ext.callStatistics
          makeAgentCallBlock(ext)
          /*
          var html = `<div id="extension_${ext.id}" class='col-sm-3 phone-block'>`
          html += `<img class="corner" src="./img/close.png" onclick="removeMonitoredExtension(${ext.id}, '${ext.name}')"></img>`
          // stats block
          html += `<div id="stats_${ext.id}" class='col-xs-12 stats'>`
          html += makeCallsStatisticBlock(ext.name, stats)
          html += `</div>`
          // title line
          html += `<div id="title_${ext.id}" class='col-xs-12 call-title'>Last call stats</div>`
          // active call block
          html += `<div id="active_calls_${ext.id}" class='col-xs-12 active-calls'>`
          html += makeActiveCallBlock(ext.activeCalls[0])
          html += `</div>`
          $('#extension_list').append(html);
          */
        }
      }

    }else if (res.status == "duplicated"){
      alert("Duplicated")
    }
  });
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

function sortUrgencyAssend(a, b) {
  return a.confidence - b.confidence;
}

function sortUrgencyDessend(a, b) {
  return b.confidence - a.confidence;
}

function sortDateAssend(a, b) {
  return a.date - b.date;
}

function sortDateDessend(a, b) {
  return b.date - a.date;
}

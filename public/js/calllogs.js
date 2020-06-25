var assend = false
var sortedByUrgency = false
var agentList = []

function init(){
  $( "#fromdatepicker" ).datepicker({ dateFormat: "yy-mm-dd"});
  $( "#todatepicker" ).datepicker({dateFormat: "yy-mm-dd"});
  var pastMonth = new Date();
  var day = pastMonth.getDate()
  var month = pastMonth.getMonth() - 1
  var year = pastMonth.getFullYear()
  if (month < 0){
    month = 11
    year -= 1
  }
  $( "#fromdatepicker" ).datepicker('setDate', new Date(year, month, day));
  $( "#todatepicker" ).datepicker('setDate', new Date());
  var height = $("#menu_header").height()
  height += $("#footer").height()
  var h = $(window).height() - (height + 110);
  $("#call_logs_list").height(h)

  window.onresize = function() {
    var height = $("#menu_header").height()
    height += $("#footer").height()

    var h = $(window).height() - (height + 110);
    $("#call_logs_list").height(h)
  }
  var offset = new Date().getTimezoneOffset()/60;
  $('#timezone option[value='+offset+']').prop('selected', true);
}

function readCallLogs(){
  var url = 'read_calllogs'
  var exts = $("#extensions").val()
  var extensionIds = ""
  if (exts.length){
    extensionIds = `( ${$("#extensions").val().join(",")} )`
  }
  var timeOffset = parseInt($("#timezone").val())
  timeOffset *= 3600000
  var from = new Date($("#fromdatepicker").val() + "T00:00:00.000Z").getTime() + timeOffset
  var to = new Date($("#todatepicker").val() + "T23:59:59.999Z").getTime() + timeOffset
  var data = {
    from: from,
    to: to,
    direction: $("#direction").val(),
    call_type: $("#call_type").val(),
    action: $("#action").val(),
    extensions: extensionIds
  }
  //alert(JSON.stringify(data))
  //return
  var posting = $.post( url, data );
  posting.done(function( res ) {
    if (res.status == "ok"){
      $("#call_logs_list").empty()
      var options = { year: 'numeric', month: 'short', day: 'numeric' };
      for (var call of res.data){
        var ringTime = (call.ringTimestamp > 0) ? new Date(call.ringTimestamp - timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
        var connectTime = (call.connectTimestamp > 0) ? new Date(call.connectTimestamp - timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
        var startDate = (call.callTimestamp > 0) ? new Date(call.callTimestamp - timeOffset).toLocaleDateString("en-US", options) : "-"
        var startTime = (call.callTimestamp > 0) ? new Date(call.callTimestamp - timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
        var disconnectTime = (call.disconnectTimestamp > 0) ? new Date(call.disconnectTimestamp - timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
        var callLength = (call.disconnectTimestamp - call.callTimestamp) / 1000
        var talkDuration = (call.connectTimestamp > 0) ? ((call.disconnectTimestamp - call.connectTimestamp) / 1000) : 0

        var html = `<div id="${call.partyId}" class="col-xs-12"><div class="col-sm-8"><div class="col-xs-12">`
        html += `<div class='col-sm-2'><b>${call.name}</b></div>`
        html += `<div class='col-sm-1'>${formatPhoneNumber(call.agentNumber)}</div>`
        html += `<div class='col-sm-1'>${formatPhoneNumber(call.customerNumber)}</div>`
        html += `<div class='col-sm-1'>${call.direction}</div>`
        html += `<div class='col-sm-1'>${call.callType}</div>`
        html += `<div class='col-sm-1'>${call.callAction}</div>`
        html += `<div class='col-sm-1'>${startDate}</div>`
        html += `<div class='col-sm-1'>${startTime}</div>`
        html += `<div class='col-sm-1'>${ringTime}</div>`
        html += `<div class='col-sm-1'>${connectTime}</div>`
        html += `<div class='col-sm-1'>${disconnectTime}</div>`
        html += `</div></div>`

        html += `<div class="col-sm-4"><div class="col-xs-12">`
        html += `<div class='col-sm-2'>${formatDurationTime(callLength)}</div>`
        html += `<div class='col-sm-2'>${formatDurationTime(call.callDuration)}</div>`
        html += `<div class='col-sm-2'>${formatDurationTime(talkDuration - call.callHoldDuration)}</div>`
        html += `<div class='col-sm-1'>${formatDurationTime(call.callHoldDuration)}</div>`
        html += `<div class='col-sm-1'>${call.holdingCount}</div>`
        html += `<div class='col-sm-1'>${formatDurationTime(call.callRespondDuration)}</div>`
        html += `<div class='col-sm-3'>${call.callResult}</div>`
        html += `</div></div></div>`
        $("#call_logs_list").append(html)
      }
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


function searchCaseNumber(){
  var caseId = $("#search").val()
  if (caseId == ""){
    $("#search").focus()
    return
  }
  $("#voicemail_items").empty()
  for (var item of voiceMailList){
    if (item['id'] == caseId){
      addRow(item)
      break
    }
  }
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

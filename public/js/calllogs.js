var agentList = []
var callLogList = []
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
  var offset = (new Date().getTimezoneOffset()/60) * (-1)
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
  var from = new Date($("#fromdatepicker").val() + "T00:00:00.000Z").getTime() - timeOffset
  var to = new Date($("#todatepicker").val() + "T23:59:59.999Z").getTime() - timeOffset
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
      //callLogList = res.data
      callLogList = []
      for (var call of res.data){
        call['callLength'] = (call.disconnectTimestamp - call.callTimestamp) / 1000
        call['connectDuration'] = (call.disconnectTimestamp > 0) ? (call.disconnectTimestamp - call.connectTimestamp) / 1000 : 0
        call['talkDuration'] = (call.connectTimestamp > 0) ? ((call.disconnectTimestamp - call.connectTimestamp) / 1000) - call.callHoldDuration : 0
        callLogList.push(call)
      }
      renderCallLogs()
    }else{
      alert(res.message)
    }
  });
}
function renderCallLogs(){
  $("#call_logs_list").empty()
  var options = { year: 'numeric', month: 'short', day: 'numeric' };
  var timeOffset = parseInt($("#timezone").val())
  timeOffset *= 3600000
  for (var call of callLogList){
    var ringTime = (call.ringTimestamp > 0) ? new Date(call.ringTimestamp + timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
    var connectTime = (call.connectTimestamp > 0) ? new Date(call.connectTimestamp + timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
    var startDate = (call.callTimestamp > 0) ? new Date(call.callTimestamp + timeOffset).toLocaleDateString("en-US", options) : "-"
    var startTime = (call.callTimestamp > 0) ? new Date(call.callTimestamp + timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
    var disconnectTime = (call.disconnectTimestamp > 0) ? new Date(call.disconnectTimestamp + timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"

    var html = `<div id="${call.partyId}" class="col-xs-12"><div class="col-sm-8"><div class="col-xs-12">`
    html += `<div class='col-sm-2'><b>${call.name}</b></div>`
    html += `<div class='col-sm-1'>${call.agentNumber}</div>`
    html += `<div class='col-sm-1'>${call.customerNumber}</div>`
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
    html += `<div class='col-sm-2'>${formatDurationTime(call.callLength)}</div>`
    html += `<div class='col-sm-2'>${formatDurationTime(call.connectDuration)}</div>`
    html += `<div class='col-sm-2'>${formatDurationTime(call.talkDuration)}</div>`
    html += `<div class='col-sm-1'>${formatDurationTime(call.callHoldDuration)}</div>`
    html += `<div class='col-sm-1'>${call.holdingCount}</div>`
    html += `<div class='col-sm-1'>${formatDurationTime(call.callRespondDuration)}</div>`
    html += `<div class='col-sm-3'>${call.callResult}</div>`
    html += `</div></div></div>`
    $("#call_logs_list").append(html)
  }
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

var ascend = false
function sortListByName(){
  if (ascend)
    callLogList.sort(sortByNameAscend)
  else
    callLogList.sort(sortByNameDescend)
  ascend = !ascend
  renderCallLogs()
}
function sortListByCallStart(){
  if (ascend)
    callLogList.sort(sortCallStartAscend)
  else
    callLogList.sort(sortCallStartDescend)
  ascend = !ascend
  renderCallLogs()
}
function sortListByCallLength(){
  //call-length
  if (ascend)
    callLogList.sort(sortCallLengthAscend)
  else
    callLogList.sort(sortCallLengthDescend)
  ascend = !ascend
  renderCallLogs()
}
function sortListByConnectDuration(){
  //connect
  if (ascend)
    callLogList.sort(sortConnectDurationAscend)
  else
    callLogList.sort(sortConnectDurationDescend)
  ascend = !ascend
  renderCallLogs()
}
function sortListByTalkDuration(){
  //talk
  if (ascend)
    callLogList.sort(sortTalkDurationAscend)
  else
    callLogList.sort(sortTalkDurationDescend)
  ascend = !ascend
  renderCallLogs()
}
function sortListByHoldDuration(){
  //hold
  if (ascend)
    callLogList.sort(sortHoldDurationAscend)
  else
    callLogList.sort(sortHoldDurationDescend)
  ascend = !ascend
  renderCallLogs()
}
function sortListByHoldCount(){
  //hold-count
  if (ascend)
    callLogList.sort(sortHoldCountAscend)
  else
    callLogList.sort(sortHoldCountDescend)
  ascend = !ascend
  renderCallLogs()
}
function sortListByRespondDuration(){
  //ring
  if (ascend)
    callLogList.sort(sortRespondDurationAscend)
  else
    callLogList.sort(sortRespondDurationDescend)
  ascend = !ascend
  renderCallLogs()
}

function sortCallStartAscend(a, b) {
  return a.callTimestamp - b.callTimestamp
}

function sortCallLengthAscend(a, b) {
  return a.callLength - b.callLength
}

function sortConnectDurationAscend(a, b) {
  return a.connectDuration - b.connectDuration
}

function sortTalkDurationAscend(a, b) {
  return a.talkDuration - b.talkDuration;
}

function sortHoldDurationAscend(a, b) {
  return a.callHoldDuration - b.callHoldDuration;
}

function sortHoldCountAscend(a, b) {
  return a.holdingCount - b.holdingCount;
}

function sortRespondDurationAscend(a, b) {
  return a.callRespondDuration - b.callRespondDuration;
}

// Descend
function sortCallStartDescend(a, b) {
  return b.callTimestamp - a.callTimestamp
}

function sortCallLengthDescend(a, b) {
  return b.callLength - a.callLength
}

function sortConnectDurationDescend(a, b) {
  return b.connectDuration - a.connectDuration
}

function sortTalkDurationDescend(a, b) {
  return b.talkDuration - a.talkDuration;
}

function sortHoldDurationDescend(a, b) {
  return b.callHoldDuration - a.callHoldDuration;
}

function sortHoldCountDescend(a, b) {
  return b.holdingCount - a.holdingCount;
}

function sortRespondDurationDescend(a, b) {
  return b.callRespondDuration - a.callRespondDuration;
}


function sortByNameAscend(a, b){
  if(a.name < b.name) { return -1; }
  if(a.name > b.name) { return 1; }
  return 0;
}

function sortByNameDescend(a, b){
  if(a.name > b.name) { return -1; }
  if(a.name < b.name) { return 1; }
  return 0;
}

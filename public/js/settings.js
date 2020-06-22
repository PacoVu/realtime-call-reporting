var canPoll = false
var agentList = []
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
  for (var i=start; i<end; i++){
    ext = agentList[i]
    optionText = ext.name;
    optionValue = ext.id;
    $('#extensions').append(`<option value="${optionValue}"> ${optionText} </option>`);
  }
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
  return a.name < b.name
}
function readExtensions(){
  var url = "get_account_extensions"
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok"){
      agentList = res.extensions
      agentList.sort()
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
      for (var ext of res.monitoredExtensions)
        $('#monitored_extensions').append(`<option value='"${ext.id}"'> ${ext.name} </option>`);
    }
  });
}

function addExtension(){
  var extId = $('#extensions').val()
  var name = $('#extensions option:selected').text();
  var url = `add_extension?id=${extId}&name=${name}`
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok"){
      var agent = {
        id: extId,
        calls: []
      }
      agentList.push(agent)
      var stats = res.data.callStatistics
      var html = `<div id="extension_${extId}" class='col-sm-3 phone-block'>`
      // stats block
      html += `<div id="stats_${extId}" class='col-xs-12'>`
      html += makeCallsStatisticBlock(name, stats)
      html += `</div>`
      // title line
      html += `<div id="title_${extId}" class='col-xs-12 call-title'>Last call stats</div>`
      // active call block
      html += `<div id="active_calls_${extId}" class='col-xs-12 active-calls'>`
      html += makeNoCallBlock()
      html += `</div>`
      $('#extension_list').append(html);
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



function sortDateAssend(a, b) {
  return a.date - b.date;
}

function sortDateDessend(a, b) {
  return b.date - a.date;
}

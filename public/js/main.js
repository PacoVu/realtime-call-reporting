//var canPoll = false
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
    timeOffset = new Date().getTimezoneOffset()*60000;
    pollResult()
}

function updateSummary(total, ringing, connected, hold){
  var html = "<b>Agent #:</b> " + total
  html += " <b>Ringing #:</b> " + ringing
  html += " <b>Connected #:</b> " + connected
  html += " <b>Hold #:</b> " + hold
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
          //var agent = agentList.find(o => o.id === extension.id)
          //alert(JSON.stringify(extension))
          if (extension.activeCalls.length){
            for (var call of extension.activeCalls){
              if (call.status == "NO-CALL"){
                var stats = extension.callStatistics
                $("#title_"+extension.id).html("Last call stats")
                $("#stats_"+extension.id).empty()
                var html = makeCallsStatisticBlock(extension.name, stats)
                $('#stats_'+extension.id).append(html);
                $("#active_calls_"+extension.id).empty()
                $("#active_calls_"+extension.id).append(makeActiveCallBlock(call))
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
            var stats = extension.callStatistics
            $("#stats_"+extension.id).empty()
            var html = makeCallsStatisticBlock(extension.name, stats)
            $('#stats_'+extension.id).append(html);
            //$("#active_calls_"+extension.id).empty()
            //$("#active_calls_"+extension.id).append(makeNoCallBlock())
          }
        }
        updateSummary(res.data.length, ringing, connected, hold)
      }
      window.setTimeout(function(){
        //if (canPoll)
          pollResult()
      }, 1000)
    }else{
      alert("er")
    }
  });
}

function makeActiveCallBlock(call){
    var startTime = new Date(call.callingTimestamp - timeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0]
    var html = `<div id='call_${call.sessionId}' class='col-sm-5'>`
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
    html += `<div class='col-sm-5'>`
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
  var html = `<div class='col-sm-5'>`
  html += `<div class='col-sm-4 center'>Call Start: --</div>`
  html += `<div class='col-sm-4 center'>From: --</div>`
  html += `<div class='col-sm-4 center'>To: --</div>`
  //html += `<div class='col-sm-4 center'>Result: --</div>`
  html += `</div>`
  html += `<div class='col-sm-5'>`
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
  var html = `<div class='col-sm-4 name'><b>${name}</b></div>`
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
  for (var i=start; i<end; i++){
    ext = agentList[i]
    optionText = ext.name;
    optionValue = ext.id;
    $('#extensions').append(`<option value="${optionValue}"> ${optionText} </option>`);
  }
}
function phoneBlock(id){
  //alert(id)
  $("#extension_"+id).empty()
  var url = `remove_extension?id=${id}`
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok"){
      $("#extension_list").empty()
      for (var ext of res.data){
        var stats = ext.callStatistics
        var html = `<div id="extension_${ext.id}" class='col-sm-3 phone-block'>`
        html += `<img class="corner" src="./img/close.png" onclick="phoneBlock(${ext.id})"></img>`
        // stats block
        html += `<div id="stats_${ext.id}" class='col-xs-12'>`
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
  return a.name < b.name
}
function readExtensions(){
  var url = "read_extensions"
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
      for (var ext of res.data){
        var stats = ext.callStatistics
        var html = `<div id="extension_${ext.id}" class='col-sm-3 phone-block'>`
        html += `<img class="corner" src="./img/close.png" onclick="phoneBlock(${ext.id})"></img>`
        // stats block
        html += `<div id="stats_${ext.id}" class='col-xs-12'>`
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
      }
    }
  });
}

function addAgents(){

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
      html += `<img class="corner" src="./img/close.png" onclick="phoneBlock(${extId})"></img>`
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
      /*
      var html = `<div id="extension_${extId}" class='col-sm-3 phone-block'>`
      html += `<div id="stats_"${extId} class='col-xs-12'>`
      html += makeCallsStatisticBlock(name, stats)
      html += `</div>`
      // title line
      html += `<div id="title_${extId}" class='col-xs-12 call-title'>Last call stats</div>`
      // active call block
      html += `</div><div id="active_calls_${extId}" class='col-xs-12 active-calls'>`
      html += makeNoCallBlock()
      html += `</div>`
      $('#extension_list').append(html);
      */
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

function updateVoicemailAge(){
  for (var item of voiceMailList){
    //
    var now = Date.now();
    var gap = formatDurationTime((now - item.date)/1000)
    var td = $("#age_" + item.id)
    var cell = $("<span>", {
      text: gap,
    });
    td.html(cell)
    //alert(gap)
  }
}

function changeCategory(item){
  var message = $('#change_category_form');
  $("#old_category").html(item.categories)
  BootstrapDialog.show({
      title: 'Change category',
      message: $('#change_category_form'),
      onhide : function(dialog) {
        $('#hidden-div-category').append(message);
      },
      buttons: [{
        label: 'Close',
        action: function(dialog) {
          dialog.close();
        }
      }, {
        label: 'Submit Change',
        cssClass: 'btn btn-primary',
        action: function(dialog) {
          var newCat = $("#new_category").val()
          if (newCat == ""){
            $("#new_category").focus()
            return
          }
          if (submitChangeCategory(item, newCat))
            dialog.close();
        }
      }]
  });
}

function submitChangeCategory(item, newCat){
  var url = "updatecategory"
  var params = {
    id: item.id,
    category: newCat
  }
  var posting = $.post( url, params );
  posting.done(function( res ) {
    if (res.status == "ok"){
      for (var i=0; i<voiceMailList.length; i++){
        if (voiceMailList[i].id == item.id){
          voiceMailList[i].categories = newCat
          listItems()
          break
        }
      }
    }else
      alert(res.message)
  });
  return true
}

function changeSource(item, source){
  var message = $('#change_source_form');
  $("#old_source").html(source)
  BootstrapDialog.show({
      title: 'Change source',
      message: $('#change_source_form'),
      onhide : function(dialog) {
        $('#hidden-div-change-source').append(message);
      },
      buttons: [{
        label: 'Close',
        action: function(dialog) {
          dialog.close();
        }
      }, {
        label: 'Submit Change',
        cssClass: 'btn btn-primary',
        action: function(dialog) {
          var newSource = $("#new_type").val()
          if (newSource == ""){
            $("#new_type").focus()
            return
          }
          if (submitChangeSource(item, newSource))
            dialog.close();
        }
      }]
  });
}

function createOpenItemLink(item){
  return "openitem?id=" + item['id'] + "&phoneNumber=" + item['fromNumber']
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

function selectForSetProcessed(id){
  var url = "setprocessed?id=" + id
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok"){
      $('#' + id).attr('disabled', true)
      for (var i=0; i<voiceMailList.length; i++){
        var item = voiceMailList[i]
        if (item.id == id){
          voiceMailList[i].processed = true
          break
        }
      }
    }
  });
}
var deleteArray = []
function selectionHandler(elm){
  if ($(elm).prop("checked")){
    deleteArray = []
    for (var item of voiceMailList){
      var eid = "#sel_"+ item.id
      $(eid).prop('checked', true);
      deleteArray.push(item.id)
      $("#delete_item").attr("disabled", false);
    }
  }else{
    for (var item of voiceMailList){
      var eid = "#sel_"+ item.id
      $(eid).prop('checked', false);
    }
    deleteArray = []
    $("#delete_item").attr("disabled", true);
  }
}

function selectForDelete(id){
  var eid = "#sel_"+ id
  if ($(eid).prop("checked")){
    deleteArray.push(id)
  }else{
    for (var i = 0; i < deleteArray.length; i++){
      if (deleteArray[i] == id){
        deleteArray.splice(i, 1)
        break
      }
    }
  }
  if (deleteArray.length)
    $("#delete_item").attr("disabled", false);
  else
    $("#delete_item").attr("disabled", true);
}

function confirmDelete(){
  var r = confirm("Are you sure you want to delete all selected items?");
  if (r == true) {
    deleteSelectedItems()
  }
}

function deleteSelectedItems(){
  if (deleteArray.length){
    var url = "deleteitem?items=" + JSON.stringify(deleteArray)
    var getting = $.get( url );
    getting.done(function( res ) {
      //alert("res" + JSON.stringify(res))
      if (res.status == "ok"){
        readVoiceMail()
      }else
        alert(res.message)
    });
    deleteArray = []
    $("#delete_item").attr("disabled", true);
  }
}
/*
function changeOrderedType(){
  var type = $("#ordered_option").val()
  if (type == "urgency"){
    sortedByUrgency = true
    $("#date_time").text("Date/Time")
    $("#date_time").attr("disabled", true);
    $("#urgency").attr("disabled", false);
    if (assend){
      $("#urgency").text("Urgency\u2193")
    }else{
      $("#urgency").text("Urgency\u2191")
    }
  }else{
    sortedByUrgency = false
    $("#urgency").text("Urgency")
    $("#urgency").attr("disabled", true);
    $("#date_time").attr("disabled", false);
    if (assend){
      voiceMailList.sort(sortUrgencyAssend)
      $("#date_time").text("Date/Time\u2193")
    }else{
      voiceMailList.sort(sortUrgencyDessend)
      $("#date_time").text("Date/Time\u2191")
    }
  }
  sortedContentList()
  listItems()
}
*/

function sortVoicemailUrgency(){
  //var type = $("#ordered_option").val()
  //if (type == "date")
  //    return

  sortedByUrgency = true
  assend = !assend
  if (assend){
    voiceMailList.sort(sortUrgencyAssend)
    $("#urgency").text("Urgency \u2193")
  }else{
    voiceMailList.sort(sortUrgencyDessend)
    $("#urgency").text("Urgency \u2191")
  }
  $("#date_time").text("Date/Time \u2195")
  listItems()
}

function sortVoicemailDate(){
  //var type = $("#ordered_option").val()
  //if (type == "urgency")
  //    return

  sortedByUrgency = false
  assend = !assend
  if (assend){
    voiceMailList.sort(sortDateAssend)
    $("#date_time").text("Date/Time \u2193")
  }else{
    voiceMailList.sort(sortDateDessend)
    $("#date_time").text("Date/Time \u2191")
  }
  $("#urgency").text("Urgency \u2195")
  listItems()
}

function sortedContentList() {
  if (sortedByUrgency){
    if (assend)
      voiceMailList.sort(sortUrgencyAssend)
    else
      voiceMailList.sort(sortUrgencyDessend)
  }else {
    if (assend)
      voiceMailList.sort(sortDateAssend)
    else
      voiceMailList.sort(sortDateDessend)
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

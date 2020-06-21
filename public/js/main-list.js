var canPoll = false
var voiceMailList = []
var assend = false
var sortedByUrgency = false
var categoryList = []
var agentList = []

function init(){
  var height = $("#menu_header").height()
    //height += $("#search_bar").height()
    //height += $("#voicemail_list_header").height()
    height += $("#footer").height()

    var h = $(window).height() - (height + 90);
    $("#extension_list").height(h)

    window.onresize = function() {
      var height = $("#menu_header").height()
      //height += $("#search_bar").height()
      //height += $("#voicemail_list_header").height()
      height += $("#footer").height()

      var h = $(window).height() - (height + 90);
      $("#extension_list").height(h)
    }
    readExtensions()
    pollResult()
}
var second = 0
function pollResult(){
  var url = "poll_calls"
  var getting = $.get( url );
  canPoll = true
  getting.done(function( res ) {
    if (res.status == "ok") {
      //alert(JSON.stringify(res.data))
      //if (res.updateData == false)
      //  return
      if (res.data.length){
        for (var extension of res.data){
          if (extension.activeCalls.length){
            for (var call of extension.activeCalls){
              //alert(JSON.stringify(call))
              if (call.status == "NO CALL"){
                second = 1
                var stats = extension.callStatistics
                $("#stats_"+extension.id).empty()
                var html = makeCallsStatisticBlock(extension.name, stats)
                $('#stats_'+extension.id).append(html);
                $("#call_"+call.sessionId).empty()
              }else if(call.status == "SETUP"){
                var html = makeActiveCallBlock(call)
                if ($("#call_"+call.sessionId).length == 0)
                  $("#active_"+extension.id).append(html)
              }else{
                $("#call_"+call.sessionId).empty()
                var html = makeActiveCallBlock(call)
                $("#call_"+call.sessionId).append(html)
                if ($("#call_"+call.sessionId).length == 0)
                  $("#active_"+extension.id).append(html)
              }
            }
          }else{
            var stats = extension.callStatistics
            $("#stats_"+extension.id).empty()
            var html = makeCallsStatisticBlock(extension.name, stats)
            $('#stats_'+extension.id).append(html);
            $("#active_"+extension.id).empty()
          }
        }
      }
      //alert("call again")
      window.setTimeout(function(){
        if (canPoll)
          pollResult()
      }, 1000)
    }else{
      alert("er")
    }
  });
}

function makeActiveCallBlock(call){
    //$("#call_"+call.sessionId).empty()
    var phoneNumber = formatPhoneNumber(call.customerNumber)
    var html = `<div id='call_${call.sessionId}'><div class='col-sm-2'>${phoneNumber}</div>`
    html += `<div class='col-sm-1'>${call.startTime}</div>`
    html += `<div class='col-sm-1'>${call.direction}</div>`
    html += `<div class='col-sm-2'>${call.status}</div>`
    var duration = second
    if (call.status == "CONNECTED")
      second++
    html += `<div class='col-sm-2'>${duration}</div>`
    html += `<div class='col-sm-2'>${formatDurationTime(call.callRespondTime)}</div>`
    html += `<div class='col-sm-2'>${formatDurationTime(call.callHoldDuration)}</div></div>`
    return html
    //$("#call_"+call.sessionId).append(html)
}

function makeCallsStatisticBlock(name, stats){
  var html = `<div class='col-sm-1'><b>${name}</b></div>`
  var totalCalls = stats.inboundCalls + stats.outboundCalls
  html += `<div class='col-sm-1'>${totalCalls}</div>`
  html += `<div class='col-sm-1'>${stats.inboundCalls}</div>`
  html += `<div class='col-sm-1'>${stats.outboundCalls}</div>`
  html += `<div class='col-sm-1'>${stats.missedCalls}</div>`
  html += `<div class='col-sm-1'>${stats.voicemails}</div>`
  html += `<div class='col-sm-2'>${formatDurationTime(stats.totalCallDuration)}</div>`
  var totalCalls = (stats.inboundCalls + stats.outboundCalls)
  totalCalls -= stats.missedCalls
  totalCalls -= stats.voicemails
  var averageTime = 0
  if (totalCalls > 0)
    averageTime = stats.totalCallDuration / totalCalls
  html += `<div class='col-sm-2'>${formatDurationTime(averageTime)}</div>`
  averageTime = 0
  if (stats.inboundCalls > 0){
    var calls = stats.inboundCalls - stats.missedCalls
    calls -= stats.voicemails
    if (calls > 0)
      averageTime = stats.totalCallRespondTime / calls
  }
  html += `<div class='col-sm-2'>${formatDurationTime(averageTime)}</div>`
  html += `</div>`
  return html
}

function checkSubscription(){
  var url = "check_subscription"
  var getting = $.get( url );
  getting.done(function( res ) {

  })
}
function readExtensions(){
  var url = "read_extensions"
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok"){
      for (var ext of res.extensions){
        optionText = ext.name;
        optionValue = ext.id;
        $('#extensions').append(`<option value="${optionValue}"> ${optionText} </option>`);
        var agent = {
          id: ext.id,
          calls: []
        }
        agentList.push(agent)
      }
      for (var ext of res.data){
        var stats = ext.callStatistics
        //var html = `<div class='col-sm-1'><div class='col-xs-12'><b>${ext.name}</b></div></div>`
        var html = `<div class='col-sm-7'><div id='stats_${ext.id}' class='col-xs-12'>`
        html += `<div class='col-sm-1'><b>${ext.name}</b></div>`
        var totalCalls = stats.inboundCalls + stats.outboundCalls
        html += `<div class='col-sm-1'>${totalCalls}</div>`
        html += `<div class='col-sm-1'>${stats.inboundCalls}</div>`
        html += `<div class='col-sm-1'>${stats.outboundCalls}</div>`
        html += `<div class='col-sm-1'>${stats.missedCalls}</div>`
        html += `<div class='col-sm-1'>${stats.voicemails}</div>`
        html += `<div class='col-sm-2'>${formatDurationTime(stats.totalCallDuration)}</div>`
        var totalCalls = (stats.inboundCalls + stats.outboundCalls)
        var averageTime = 0
        if (totalCalls > 0)
          stats.totalCallDuration / totalCalls
        html += `<div class='col-sm-2'>${formatDurationTime(averageTime)}</div>`
        if (stats.inboundCalls > 0)
          averageTime = stats.totalCallRespondTime / stats.inboundCalls
        else
          averageTime = 0
        html += `<div class='col-sm-2'>${formatDurationTime(averageTime)}</div>`

        html += `</div></div>`
        html += `<div class='col-sm-5'><div id='active_${ext.id}' class='col-xs-12'>`
        html += `</div></div>`
        $('#extension_list').append(html);
      }
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
      var html = `<div class='col-sm-7'><div id='stats_${extId}' class='col-xs-12'>`
      html += `<div class='col-sm-2'><b>${name}</b></div>`
      var totalCalls = stats.inboundCalls + stats.outboundCalls
      html += `<div class='col-sm-1'>${totalCalls}</div>`
      html += `<div class='col-sm-1'>${stats.inboundCalls}</div>`
      html += `<div class='col-sm-1'>${stats.outboundCalls}</div>`
      html += `<div class='col-sm-1'>${stats.missedCalls}</div>`
      html += `<div class='col-sm-1'>${stats.voicemails}</div>`
      html += `<div class='col-sm-1'>${formatDurationTime(stats.totalCallDuration)}</div>`
      var totalCalls = (stats.inboundCalls + stats.outboundCalls)
      var averageTime = 0
      if (totalCalls > 0)
        stats.totalCallDuration / totalCalls
      html += `<div class='col-sm-2'>${formatDurationTime(averageTime)}</div>`
      if (stats.inboundCalls > 0)
        averageTime = stats.totalCallRespondTime / stats.inboundCalls
      else
        averageTime = 0
      html += `<div class='col-sm-2'>${formatDurationTime(averageTime)}</div>`

      html += `</div></div>`
      html += `<div class='col-sm-5'><div id='active_${extId}' class='col-xs-12'>`
      html += `</div></div>`
      $('#extension_list').append(html);
    }else if (res.status == "duplicated"){
      alert("Duplicated")
    }
  });
}

function logout(){
  window.location.href = "index?n=1"
}

function addRow(item){
  var row = $("<tr>", {
    id: item.id,
    class: "tr-active"
  })
  var td = $("<td>", {
    });

  var cell = $("<input>", {
    id: "sel_" + item.id,
    name: item.id,
    type: "checkbox",
    onclick: "selectForDelete(name)"
    });
  td.append(cell)
  row.append(td)

  // duration
  td = $("<td>", {
    });
  cell = $("<span>", {
    text: item.duration,
    });
  td.append(cell)
  row.append(td)

  // from
  td = $("<td>")
  if (item.fromNumber != "Unknown") {
      var href =  "rcmobile://call?number=" + item.fromNumber
      if (item.fromName != "Unknown")
          linkText = item.fromName
      else{
        var formattedNumber = formatPhoneNumber(item.fromNumber)
        if (formattedNumber != null)
          linkText = formattedNumber
        else
          linkText = item.fromNumber
      }
      var a = linkText + " <a href='"+ href + "'><img src='./img/call.png'></a>"
      cell = $("<div>")
      cell.html(a)
  }else{
      cell = $("<span>", {
        text: item.fromNumber,
        });
  }
  td.append(cell)
  row.append(td)

  // Source
  var source = item.reputation.source

  td = $("<td>", {
    class: "td-active"
    });

  if (source == "Unknown"){
    var text = "<span>" + source + "</span> <img height='10px' src='./img/edit.png'></img>"
    cell = $("<div>")
    cell.html(text)
    td.append(cell)
    td.click( function() {
        changeSource(item, source)
    });
  }else{
    td.click( function() {
       window.location.href = createOpenItemLink(item)
    });
    cell = $("<span>", {
      text: source,
    });
  }

  td.append(cell)
  row.append(td)

  // spam
  td = $("<td>", {
    class: "td-active"
    });
  td.click( function() {
      window.location.href = createOpenItemLink(item)
  });
  /*
  Score	Risk Level	Recommendation
  801-1000	high	block
  601-800	medium-high	block
  401-600	medium	flag
  201-400	medium-low	allow
  0-200	low	allow
  */

  var color = "color: green"
  /*
  if (item.reputation.score >= 801){
      spam = "Risky"
      color = "color: red"
  }else if (item.reputation.score >= 601){
      spam = "Highly"
      color = "color: brown"
  }else if (item.reputation.score >= 401){
      spam = "Likely"
      color = "color: orange"
  }else if (item.reputation.score >= 0){
      spam = "Clean"
  }
  */
  if (item.reputation.level == "Risky"){
      color = "color: red"
  }else if (item.reputation.level == "Highly"){
      color = "color: brown"
  }else if (item.reputation.level == "Likely"){
      color = "color: orange"
  }else if (item.reputation.level == "Clean"){
      color = "color: green"
  }
  cell = $("<span>", {
    text: item.reputation.level,
    style: color,
    });
  td.append(cell)
  row.append(td)

  // urgency
  td = $("<td>", {
    class: "td-active",
    align: "center"
    });
  td.click( function() {
      window.location.href = createOpenItemLink(item)
  });
  cell = $("<span>", {
    text: item.confidence,
  });

  td.append(cell)
  row.append(td)

  // date
  td = $("<td>", {
    class: "td-active",
    align: "center"
  });
  td.click( function() {
      window.location.href = createOpenItemLink(item)
  });

  let options = {  month: 'short',day: 'numeric',year: 'numeric',hour: '2-digit',minute: '2-digit'}
  var dateTime = new Date(parseFloat(item.date)).toLocaleDateString("en-US", options)
  cell = $("<span>", {
    text: dateTime,
    });
  td.append(cell)
  row.append(td)

  // Age
  var now = Date.now();
  var gap = formatVoicemailAge((now - item.date)/1000)
  td = $("<td>", {
    id: "age_" + item.id,
    class: "td-active",
    align: "left"
    });

  cell = $("<span>", {
    text: gap,
  });

  td.append(cell)
  row.append(td)

  // listen
  td = $("<td>", {
    class: "td-active"
    });

  cell = $("<input>", {
      type: "image",
      src: "./img/listen.png",
      onclick: "getAudioLink('"+ item['contentUri']+ "')"
  });

  td.append(cell)
  row.append(td)

  // transcript
  td = $("<td>", {
    class: "td-active"
    });
  cell = $("<span>", {
    text: item.transcript,
    });
  td.append(cell)
  td.click( function() {
      window.location.href = createOpenItemLink(item)
  });
  row.append(td)

  // tag
  td = $("<td>", {
    class: "td-active"
    });
  var text = "<span>" + item.categories + "</span> <img height='10px' src='./img/edit.png'></img>"
  cell = $("<div>")
  cell.html(text)
  td.append(cell)

  td.click( function() {
      changeCategory(item)
  });

  row.append(td)

  // assigned
  td = $("<td>", {
    class: "td-active"
    });
  var text = "<span>" + item.assigned + "</span> <img height='10px' src='./img/edit.png'></img>"
  cell = $("<div>")
  cell.html(text)
  td.append(cell)
  td.click( function() {
      changeAgent(item)
  });
  row.append(td)

  // Responded
  var td = $("<td>", {
    align: "center"
  });

  var cell = $("<input>", {
    id: item['id'],
    type: "checkbox",
    disabled: item.processed,
    checked: item.processed,
    onclick: "selectForSetProcessed(id)"
    });
  td.append(cell)
  row.append(td)
  // implement onclick
  /*
  row.click( function() {
      window.location.href = "openitem?id=" + item['id']
  });
  */
  $("#voicemail_items").append(row)
}

function formatDurationTime(dur){
  dur = Math.floor(dur)
  if (dur > 86400) {
    var d = Math.floor(dur / 86400)
    dur = dur % 86400
    var h = Math.floor(dur / 3600)
    //h = (h>9) ? h : "0" + h
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return d + "d " + h + ":" + m + ":" + s
  }else if (dur >= 3600){
    var h = Math.floor(dur / 3600)
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return h + ":" + m + ":" + s
  }else if (dur >= 60){
    var m = Math.floor(dur / 60)
    dur %= 60
    var s = (dur>9) ? dur : ("0" + dur)
    return m + ":" + s
  }else{
    //var s = (dur>9) ? dur : ("0" + dur)
    return dur + " secs"
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

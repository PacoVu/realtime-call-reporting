var canPoll = true

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
  var height = $("#option_bar").height()
  height += $("#footer").height()

  var h = $(window).height() - (height + 90);
  $("#reporting_list").height(h)

  window.onresize = function() {
      var height = $("#option_bar").height()
      //height += $("#search_bar").height()
      //height += $("#voicemail_list_header").height()
      height += $("#footer").height()

      var h = $(window).height() - (height + 90);
      $("#reporting_list").height(h)
  }
  google.charts.load('current', {'packages':['corechart']});
  google.charts.load('current', {'packages':['gauge']});
  google.charts.setOnLoadCallback(readReports);
  var offset = new Date().getTimezoneOffset()/60;
  $('#timezone option[value='+offset+']').prop('selected', true);
}

function readReports(){
  var url = "read_reports"
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
    time_offset: timeOffset,
    from: from,
    to: to,
    extensions: extensionIds
  }
  var posting = $.post( url, data );
  posting.done(function( res ) {
    if (res.status == "ok"){
      $("#reporting_list").empty()
      var html = `<div class='col-xs-12'><div class='col-sm-5'></div><div id='first-row' class='col-sm-2'></div><div class='col-sm-5'></div></div>`
      html += `<div id='second-row' class='col-xs-12'></div>`
      html += `<div id='third-row' class='col-xs-12'></div>`
      $('#reporting_list').append(html);
      ActiveCallsByDirection("first-row", res.data)
      CallsByDirectionGraph("second-row", res.data)
      CallsByDurationGraph("second-row", res.data)
      CallByActionGraph("second-row", res.data)
      LongestActivityTime("second-row", res.data)
      CallsDensityGraph("third-row", res.data)
    }
    window.setTimeout(function(){
      if (canPoll)
        readReports()
    }, 5000)
  });
}

function LongestActivityTime(row, data){
  var params = [];
  var arr = ['Longest activity time (mins)', 'Duration', { role: "style" } ];
  params.push(arr);

  //var item = ["Call duration", data.longestCallDuration/60, "purple"];
  //params.push(item);

  var item = ["Talk time", data.longestTalkDuration/60, "brown"];
  params.push(item);

  item = ["Respond time", data.longestRespondDuration/60, "blue"];
  params.push(item);

  item = ["Hold time", data.longestHoldDuration/60, "green"];
  params.push(item);
  drawBarChart(params, row);
}

function ActiveCallsByDirection(row, data){
    var params = [];
    var arr = ['Active Calls', 'Calls'];
    params.push(arr);
    var item = ["Inbound", data.inboundActiveCalls];
    params.push(item);
    item = ["Outbound", data.outboundActiveCalls];
    params.push(item);
    drawGauge(params, row)
}
function CallsByDurationGraph(row, data){
    var params = [];
    var arr = ['Total calls duration (hr)', 'Duration', { role: "style" }];
    params.push(arr);
    item = ["Inbound", data.totalInboundCallDuration/3600, "blue"];
    params.push(item);
    item = ["Talk", data.totalInboundTalkDuration/3600, "purple"];
    params.push(item);
    item = ["Hold", data.totalInboundHoldDuration/3600, "red"];
    params.push(item);
    item = ["Respond", data.totalInboundRespondDuration/3600, "brown"];
    params.push(item);
    item = [];
    var item = ["Outbound", data.totalOutboundCallDuration/3600, "green"];
    params.push(item);
    drawBarChart(params, row)
}

function CallByActionGraph(row, data){
    var params = [];
    var arr = ['Call by Action', 'Message', { role: "style" } ];
    params.push(arr);

    var item = ["Connected", data.connected, "purple"];
    params.push(item);

    item = ["Missed", data.missed, "blue"];
    params.push(item);

    item = ["Voicemail", data.voicemail, "green"];
    params.push(item);

    item = ["Cancelled", data.cancelled, "brown"];
    params.push(item);

    item = ["Parked", data.parked, "Yellow"];
    params.push(item);

    drawBarChart(params, row);
}

function CallsByDirectionGraph(row, data){
    var params = [];
    var arr = ['Calls by direction', 'Direction', { role: "style" } ];
    params.push(arr);
    var item = ["Inbound", data.inbound, "blue"];
    params.push(item);

    item = ["Outbound", data.outbound, "green"];
    params.push(item);
    drawBarChart(params, row);
}

function drawGauge(params, row){
  var data = google.visualization.arrayToDataTable(params);

  var options = {
    title: params[0][0],
    width: 400, height: 200,
    redFrom: 90, redTo: 100,
    yellowFrom:75, yellowTo: 90,
    minorTicks: 5
  };

  //var element = document.createElement('div')
  //$(element).addClass("col-sm-4")
  //$("#"+row).append(element)
  var element = document.getElementById('first-row')
  var chart = new google.visualization.Gauge(element);
  chart.draw(data, options);
}

function drawBarChart(params, row){
    var data = google.visualization.arrayToDataTable(params);
    var view = new google.visualization.DataView(data);
    view.setColumns([0, 1,
                    { calc: "stringify",
                       sourceColumn: 1,
                       type: "string",
                       role: "annotation"
                    },
                    2]);

    var options = {
      title: params[0][0],
      //chartArea:{left:0,top:0,width:"90%",height:"100%"},
      width: "100%",
      height: 300,
      bar: {groupWidth: "90%"},
      legend: { position: "none" },
    };

    var element = document.createElement('div')
    $(element).addClass("col-sm-3")
    $("#"+row).append(element)
    var chart = new google.visualization.ColumnChart(element);
    chart.draw(view, options);
}

function drawScatterChart(params, title, row) {
    var data = google.visualization.arrayToDataTable(params);
    var options = {
      title: title,
      //width: "100%",
      height: 300,
      vAxis: {title: 'Calls'},
      hAxis: {title: '24-Hour', minValue: 0, maxValue: 23, gridlines: { count: 0 }},
      viewWindow: {minValue: 0, maxValue: 23},
      //pointShape: 'diamond',
      pointShape: { type: 'triangle', rotation: 180 },
      legend: 'none',
    };

    var element = document.createElement('div')
    $(element).addClass("col-sm-3")
    $("#"+row).append(element)
    var chart = new google.visualization.LineChart(element);
    chart.draw(data, options);

    //var chart = new google.charts.Scatter(element);
    //chart.draw(data, google.charts.Scatter.convertOptions(options));
}

function CallsDensityGraph(row, data){
    params = [];
    var arr = ['Inbound Calls density', ''];
    params.push(arr);
    for (var t=0; t<24; t++){
      var item = [];
      item.push(t);
      item.push(data.inboundCallTime[t]);
      params.push(item);
    }
    drawScatterChart(params, "Inbound Calls density", row)
    params = [];
    arr = ['Outbound Calls density', ''];
    params.push(arr);
    for (var t=0; t<24; t++){
      var item = [];
      item.push(t);
      item.push(data.outboundCallTime[t]);
      params.push(item);
    }
    drawScatterChart(params, "Outbound Calls density", row)

    params = [];
    arr = ['Missed Calls density', ''];
    params.push(arr);
    for (var t=0; t<24; t++){
      var item = [];
      item.push(t);
      item.push(data.missedCallTime[t]);
      params.push(item);
    }
    drawScatterChart(params, "Missed Calls density", row)

    params = [];
    arr = ['Voicemail density', ''];
    params.push(arr);
    for (var t=0; t<24; t++){
      var item = [];
      item.push(t);
      item.push(data.voicemailTime[t]);
      params.push(item);
    }
    drawScatterChart(params, "Voicemails density", row)
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
        averageTime = stats.totalCallRespondDuration / stats.inboundCalls
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

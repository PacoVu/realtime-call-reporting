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
    height += $("#footer").height()
    var h = $(window).height() - (height + 90);
    $("#reporting_list").height(h)
  }
  google.charts.load('current', {'packages':['corechart']});
  google.charts.load('current', {'packages':['gauge']});
  google.charts.setOnLoadCallback(readReports);
  var offset = (new Date().getTimezoneOffset()/60) * (-1)
  $('#timezone option[value='+offset+']').prop('selected', true)
}

function updateSummary(){
  var total = $("#extensions option:selected").length;
  $("#summary").html("Total agent: " + total)
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
  var from = new Date($("#fromdatepicker").val() + "T00:00:00.000Z").getTime() - timeOffset
  var to = new Date($("#todatepicker").val() + "T23:59:59.999Z").getTime() - timeOffset
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
      var html = `<div class='col-xs-12'><div class='col-sm-4'></div><div id='first-row' class='col-sm-4'></div><div class='col-sm-4'></div></div>`
      html += `<div id='second-row' class='col-xs-12'></div>`
      html += `<div id='third-row' class='col-xs-12'></div>`
      $('#reporting_list').append(html);
      ActiveCallsByDirection("first-row", res.data)
      CallsByDirectionGraph("second-row", res.data)
      CallsByDurationGraph("second-row", res.data)
      CallByActionGraph("second-row", res.data)
      LongestActivityTime("second-row", res.data)
      CallsDensityGraph("third-row", res.data)
      updateSummary()
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

  var item = ["Talk", data.longestTalkDuration/60, "brown"];
  params.push(item);

  item = ["Ring", data.longestRespondDuration/60, "blue"];
  params.push(item);

  item = ["Hold", data.longestHoldDuration/60, "green"];
  params.push(item);
  drawColumnChart(row, params)
}

function CallsByDurationGraph(row, data){
    var params = [];
    var arr = ['Total duration (hr)', 'Duration', { role: "style" }];
    params.push(arr);
    //item = ["Inbound", data.totalInboundCallDuration/3600, "green"];
    //params.push(item);
    item = ["Talk In", data.totalInboundTalkDuration/3600, "blue"];
    params.push(item);
    //item = ["Outbound", data.totalOutboundCallDuration/3600, "lime"];
    //params.push(item);
    item = ["Talk Out", data.totalOutboundTalkDuration/3600, "purple"];
    params.push(item);
    //item = ["Talk", data.totalInboundTalkDuration/3600, "purple"];
    //params.push(item);
    item = ["Hold", data.totalInboundHoldDuration/3600, "red"];
    params.push(item);
    item = ["Ring", data.totalInboundRespondDuration/3600, "brown"];
    params.push(item);
    //item = [];

    drawColumnChart(row, params)
}

function CallByActionGraph(row, data){
    var params = [];
    var arr = ['Call by Result (# calls)', 'Message', { role: "style" } ];
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

    drawColumnChart(row, params)
}

function CallsByDirectionGraph(row, data){
    var params = [];
    var arr = ['Calls by direction (# calls)', 'Direction', { role: "style" } ];
    params.push(arr);
    var item = ["Inbound", data.inbound, "blue"];
    params.push(item);

    item = ["Outbound", data.outbound, "green"];
    params.push(item);
    drawColumnChart(row, params)
}

function ActiveCallsByDirection(row, data){
    var params = [];
    var arr = ['Active Calls', 'Calls', { role: "style" } ];
    params.push(arr);
    var item = ["In Calls", data.inboundActiveCalls, "blue"];
    params.push(item);
    item = ["Out Calls", data.outboundActiveCalls, "green"];
    params.push(item);
    var total = (data.outboundActiveCalls + data.inboundActiveCalls)
    item = ["Total Calls", total, "purple"];
    params.push(item);
    var idle = $("#extensions").val().length - (data.outboundActiveCalls + data.inboundActiveCalls)
    item = ["Idle", idle, "brown"];
    params.push(item);

    //drawGauge(row, params)
    //drawPieChart(row, params)
    drawBarChart(row, params)
    //drawColumnChart(row, params)
}

function drawGauge(row, params){
  var data = google.visualization.arrayToDataTable(params);
  var options = {
    title: params[0][0],
    width: 400, height: 200,
    redFrom: 90, redTo: 100,
    yellowFrom:75, yellowTo: 90,
    minorTicks: 5
  };
  var element = document.getElementById('first-row')
  var chart = new google.visualization.Gauge(element);
  chart.draw(data, options);
}

function drawPieChart(row, params){
  var data = google.visualization.arrayToDataTable(params);
  var options = {
    title: 'Agents by Activity (# agents)',
    width: 400,
    height: 200,
    pieHole: 0.4,
  };
  var element = document.getElementById(row)
  var chart = new google.visualization.PieChart(element);
  chart.draw(data, options);
}

function drawColumnChart(row, params){
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
      vAxis: {minValue: 0},
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

function drawBarChart(row, params){
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
      vAxis: {minValue: 0},
      width: "100%",
      height: 200,
      bar: {groupWidth: "90%"},
      legend: { position: "none" },
    };

    var element = document.getElementById(row)
    var chart = new google.visualization.BarChart(element);
    chart.draw(view, options);
}

function drawScatterChart(params, title, row) {
    var data = google.visualization.arrayToDataTable(params);
    var options = {
      title: title,
      //width: "100%",
      height: 300,
      vAxis: {title: 'Calls', minValue: 0, gridlines: { count: 23 }},
      hAxis: {title: '24-Hour', minValue: 0, maxValue: 23},
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
    //var chart = new google.visualization.ScatterChart(element);
    //chart.draw(data, options);
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

function logout(){
  window.location.href = "index?n=1"
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

function formatPhoneNumber(phoneNumberString) {
  var cleaned = ('' + phoneNumberString).replace(/\D/g, '')
  var match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/)
  if (match) {
    var intlCode = (match[1] ? '+1 ' : '')
    return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('')
  }
  return phoneNumberString
}


function sortDateAssend(a, b) {
  return a.date - b.date;
}

function sortDateDessend(a, b) {
  return b.date - a.date;
}

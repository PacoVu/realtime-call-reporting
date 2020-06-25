var agentList = []
var newExtensionList = []
var removeExtensionList = []
function init(){
  var height = $("#menu_header").height()
  height += $("#footer").height()
  var h = $(window).height() - (height + 90);
  $("#content-list").height(h)
  //$("#monitored_extensions").height(h)

  window.onresize = function() {
    var height = $("#menu_header").height()
    height += $("#footer").height()
    var h = $(window).height() - (height + 90);
    $("#content-list").height(h)
    //$("#monitored_extensions").height(h)
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
  $('#extensions').selectpicker('refresh');
}
function clearSearch(){
  //alert("clear")
  $("#search").val("")
}
function searchAgent(){
  //alert("search")
  var agentName = $("#search").val().toLowerCase()
  $('#extensions').empty()
  for (var agent of agentList){
    if (agent.name.toLowerCase().indexOf(agentName) >= 0){
      optionText = agent.name;
      optionValue = agent.id;
      $('#extensions').append(`<option value="${optionValue}"> ${optionText} </option>`);
    }
  }
  $('#extensions').selectpicker('refresh');
  $('#extensions').selectpicker('selectAll');
  /*
  if (agentName.length == 1){
    $('#extensions').selectpicker('toggle');
    $("#search").focus()
  }
  */
  /*
  $('#extensions').empty()
  var foundList = []
  for (var agent of agentList){
    if (agent.name.toLowerCase().indexOf(agentName) >= 0){
      optionText = agent.name;
      optionValue = agent.id;
      $('#extensions').append(`<option value="${optionValue}"> ${optionText} </option>`);
    }
  }
  */
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
        //$('#monitored_extensions').append(`<option value='"${ext.id}"'> ${ext.name} </option>`);
        $('#monitored_extensions').append(`<div id='"c_${ext.id}"'> <input type='checkbox' id='"${ext.id}"' onclick='selectForRemove("${ext.id}")'></input> ${ext.name}</div>`);
    }
  });
}
function selectForRemove(id){
  var i = removeExtensionList.findIndex(o => o === id)
  if (i >= 0){
    return removeExtensionList.splice(i, 1)
  }else
    removeExtensionList.push(id)
  //alert(removeExtensionList.length)
}

function selectExtension(){
  var extensionIds = $('#extensions').val()
  var extensionNames = $('#extensions option:selected').toArray().map(item => item.text).join();
  var extensionNameList = extensionNames.split(",")

  for (var i=0; i<extensionIds.length; i++){
    if (newExtensionList.find(o => o.id === extensionIds[i]) == undefined){
      var item = {
        id: extensionIds[i],
        name: extensionNameList[i]
      }
      $("#new_extensions").append(`<div>${extensionNameList[i]}</div>`);
      newExtensionList.push(item)
    }
  }

  /*
  if (newExtensionList.find(o => o.id === $('#extensions').val()))
    return
  var extension = {
    id: $('#extensions').val(),
    name: $('#extensions option:selected').text()
  }
  //$("#new_extensions").append(`<option selected value='"${$('#extensions').val()}"'> ${$('#extensions option:selected').text()} </option>`);
  $("#new_extensions").append(`<div>${$('#extensions option:selected').text()}</div>`);
  newExtensionList.push(extension)
  */
}

function confirmRemove(){
  if (removeExtensionList.length == 0){
    return alert("Please select extensions from the monitored extensions list to remove.")
  }
  var r = confirm("Are you sure you want to remove the selected extension(s)?");
  if (r == true) {
    removeExtensions()
  }
}

function removeExtensions(){
  var data = {
    extensions: JSON.stringify(removeExtensionList)
  }
  //return alert(data.extensions)

  removeExtensionList = []
  var url = `remove_account_extensions`
  var posting = $.post( url, data );
  posting.done(function( res ) {
    if (res.status == "ok"){
      $('#monitored_extensions').empty()
      for (var ext of res.data)
        $('#monitored_extensions').append(`<div id='"${ext.id}"' onclick='selectForRemove("${ext.id}")'> <input type='checkbox' id='"ch_${ext.id}"'></input> ${ext.name}</div>`);
    }else if (res.status == "failed"){
      alert("Cannot remove. Try again.")
    }
  });
}

function addExtensions(){
  if (newExtensionList.length == 0){
    return alert("Please select extensions from the account extensions list.")
  }
  var data = {
    extensions: JSON.stringify(newExtensionList)
  }
  $("#new_extensions").empty()
  newExtensionList = []
  var url = `add_account_extensions`
  var posting = $.post( url, data );
  posting.done(function( res ) {
    if (res.status == "ok"){
      $('#monitored_extensions').empty()
      for (var ext of res.data)
        $('#monitored_extensions').append(`<option value='"${ext.id}"'> ${ext.name} </option>`);
    }else if (res.status == "duplicated"){
      alert("Duplicated")
    }
  });
}

function resetSubscription(){
    var url = `reset_account_subscription?delete=` + $("#delete-sub").is(":checked")
    //return alert(url)
    var getting = $.get( url );
    getting.done(function( res ) {
      if (res.status == "ok"){

      }else{
        alert("Cannot reset subscription")
      }
    });
}

function logout(){
  window.location.href = "index?n=1"
}

function sortDateAssend(a, b) {
  return a.date - b.date;
}

function sortDateDessend(a, b) {
  return b.date - a.date;
}

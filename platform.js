const RingCentral = require('@ringcentral/sdk').SDK
require('dotenv').load()

function RCPlatform(mode) {
  this.token_json = null
  this.extensionId = ""
  var clientId = process.env.CLIENT_ID_PROD
  var clientSecret = process.env.CLIENT_SECRET_PROD
  var serverURL = RingCentral.server.production
  if (mode == "sandbox"){
    clientId = process.env.CLIENT_ID_SB
    clientSecret = process.env.CLIENT_SECRET_SB
    serverURL = RingCentral.server.sandbox
  }
  this.rcsdk = new RingCentral({
      server: serverURL,
      clientId: clientId,
      clientSecret:clientSecret,
      redirectUri: process.env.RC_APP_REDIRECT_URL
      })
  this.platform = this.rcsdk.platform()
  return this
}

RCPlatform.prototype = {
  login: async function(code){
    try{
      var resp = await this.rcsdk.login({
        code: code,
        redirectUri: process.env.RC_APP_REDIRECT_URL
      })
      var tokenObj = await resp.json()
      var newToken = {}
      newToken['access_token'] = tokenObj.access_token
      newToken['expires_in'] = tokenObj.expires_in
      newToken['token_type'] = tokenObj.token_type
      newToken['refresh_token'] = tokenObj.refresh_token
      newToken['refresh_token_expires_in'] = tokenObj.refresh_token_expires_in
      newToken['login_timestamp'] = Date.now() / 1000
      this.token_json = newToken
      this.extensionId = tokenObj.owner_id
      return  tokenObj.owner_id
    }catch(e){
      console.log('PLATFORM LOGIN ERROR ' + e.message || 'Server cannot authorize user');
      return null
    }
  },
  logout: async function(){
    console.log("logout from platform engine")
    await this.platform.logout()
  },
  getPlatform: function(){
    if (this.platform.loggedIn()){
        return this.platform
    }else{
        console.log("BOTH TOKEN TOKENS EXPIRED")
        console.log("CAN'T REFRESH: " + e.message)
        return null
    }
  }
}

module.exports = RCPlatform;

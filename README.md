## How to build and run the demo

### Create a RingCentral app
* Create an application at https://developer.ringcentral.com.
* Select `Other Non-UI` option for the Platform type.
* Add the `ReadAccounts` and `Call Control` and "Webhook  `Subscriptions` permissions for the app.
* Copy the Client id and Client secret and add them to the `.env` file as shown in the next section.

### Clone - Setup - Run the project
```
$ git clone https://github.com/paco-vu/realtime-call-reporting

$ cd realtime-call-reporting

$ npm intall --save

$ cp dotenv .env
```

Specify the app and user credentials in the .env file accordingly
```
CLIENT_ID_SB=Your-App-Client-Id-Sandbox
CLIENT_SECRET_SB=Your-App-Client-Secret-Sandbox

USERNAME_SB=Your-Sandbox-Username
PASSWORD_SB=Your-Sandbox-Password
EXTENSION_SB=Your-Sandbox-User-Extension-Number

CLIENT_ID_PROD=Your-App-Client-Id-Sandbox
CLIENT_SECRET_PROD=Your-App-Client-Id-Sandbox

USERNAME_PROD=Your-Production-Username
PASSWORD_PROD=Your-Production-Password
EXTENSION_PROD=Your-Production-User-Extension-Number
```

If you want to demo on your sandbox, change the mode to "sandbox"
```
MODE=production
```

### Run ngrok
```
$ ngrok http 5001
```
Copy the ngrok address and specify it in the .env as follow:

```
DELIVERY_MODE_ADDRESS=https://7ba3f616.ngrok.io/webhookcallback
```

### Run the demo
```
$ node index.js
```
* Open your browser and enter the local address "locahost:5001"
* Make a call to one of the extension under your account

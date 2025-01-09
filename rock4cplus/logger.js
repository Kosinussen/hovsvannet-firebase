const admin = require("firebase-admin");
const exec = require('child_process').exec;
const serialport = require('serialport');
const Readline = require('@serialport/parser-readline');

const port = new serialport.SerialPort({ 
  baudRate: 9600,
  path: "/dev/ttyACM0"
});

const parser = new Readline.ReadlineParser({
  delimeter : '\n'
})

// Fetch the service account key JSON file contents
var serviceAccount = require("credentials.json");

// Initialize the app with a service account, granting admin privileges
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hovsvannet-default-rtdb.europe-west1.firebasedatabase.app/"
});

var db = admin.database();
const measurements = db.ref('measurements');
const waterLevelMeasurements = db.ref('waterLevelMeasurements');
const apiKey = "281932b2-cbc1-4e42-828a-e8fc61549de3";
const url = "https://badetemperaturer.yr.no/api/registrere";

let temp

let waterTemperatureKey
let waterLevelKey

// lager ett array for alle 60 measurements i minuttet
let waterLevelArray = []
// lager ett array for alle valide measurements
let validWaterLevelArray = []

async function startMeasurements(){
    const lastMeasurement = await measurements.limitToLast(1).once('value')
    waterTemperatureKey = parseInt(Object.keys(lastMeasurement.val())[0])
    const lastWaterLevelMeasurement = await waterLevelMeasurements.limitToLast(1).once('value')
    waterLevelKey = parseInt(Object.keys(lastWaterLevelMeasurement.val())[0])
    console.log('siste waterTemperature-key i databasen: ', waterTemperatureKey)
    console.log('siste waterLevel-key i databasen: ', waterLevelKey)
    
    // mottar vannstandsdata far arduino
    port.pipe(parser);
    parser.on('data', (data) => {
        waterLevelArray.push(parseFloat(data))
        if(parseFloat(data) < 500){
            validWaterLevelArray.push(parseFloat(data))
        }
    });
    setInterval(getWaterTemperature ,60000)
    setInterval(getWaterLevel ,60000)
    setInterval(postRequestYr ,1200000)
}

function getWaterTemperature(){
    try{
        exec("digitemp_DS9097 -q -t 0", function(error, stdout, stderr){ 
        temp = parseFloat(stdout)
        if(temp<50){
            console.log('waterTemperatureKey: ',waterTemperatureKey); 
            console.log('temperatur: ',stdout)
            const date = Math.ceil(((new Date()).getTime())/1000)
            measurements.update({
                [waterTemperatureKey]:{
                temp: temp,
                dato: date
                }
            });
            waterTemperatureKey++ 
        }else{
            console.log("Error: temperatur, registrert temperatur: ", temp)
        } 
    });
    }
    catch(err){
        console.error(err)
    }
}

async function postRequestYr(){
    const date = (new Date()).toISOString().slice(0,19)

    const payload = [
            {
            "name": "Hovsvatnet",
            "lat": 58.49370, 
            "lon": 6.50388,
            "heatedWater": false,
            "temperature": temp.toFixed(1),
            "time": date
            }
        ];
    
    try{
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                apikey: apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        console.log("POST request status: ", response.status);
    }
    catch(err){
        console.error(err)
    }
}

async function getWaterLevel(){
    const date = Math.ceil(((new Date()).getTime())/1000)
    try{
        // sjekker om det er noen valide measurements og sender da til databasen
        if(validWaterLevelArray[5]){
            validWaterLevelArray.sort(function(a, b){return a-b});
            console.log('waterLevelKey: ',waterLevelKey); 
            console.log("waterlevel: "+ validWaterLevelArray[Math.floor(validWaterLevelArray.length/2)].toFixed(1))
            waterLevelMeasurements.update({
                [waterLevelKey]:{
                level: parseFloat(validWaterLevelArray[Math.floor(validWaterLevelArray.length/2)].toFixed(1)),
                dato: date
                }
            });
            waterLevelKey++
        }else{
            console.log("Error: vannstand, registrerte vannstander: ", waterLevelArray)
        }
        waterLevelArray = []
        validWaterLevelArray = [];
    }
    catch(err){
        console.error(err)
    }
}

startMeasurements()
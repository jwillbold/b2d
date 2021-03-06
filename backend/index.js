const WebSocket = require('ws');
const Influx = require('influx');
const http = require('http');
const express = require('express');
const trilateration = require('./trilateration');

const app = express();

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/getToolPos', async (req, res) => res.json(await getPos(req.query.toolId)));

async function getPos(toolId) {
  let rssis = await influx.query(`SELECT median("rssi") FROM "b2dping" WHERE ("tool_id" = '1.2') AND time >= now() - 3s GROUP BY "recv_bd_addr"`);
  rssis.sort((a, b) => {return a.recv_bd_addr < b.recv_bd_addr })

  rssis = rssis.map(x => x.median);
  let loc = trilateration.trilat(rssis);
  return loc;
}

const influx = new Influx.InfluxDB({
  host: 'localhost',
  database: 'b2dth_db',
  port: 8086,
  username: 'connor',
  password: 'pa$$w0rd',
  schema: [
   {
     measurement: 'b2dping',
     fields: {
       rssi: Influx.FieldType.INTEGER,
     },
     tags: [
       'tool_id',
       'recv_bd_addr'
     ]
   }
  ]
});

influx.createDatabase('b2dth_db');

const server = http.createServer(app);
const wss = new WebSocket.Server({server: server})

wss.on('connection', function connection(ws) {
  console.log("New connection...");
  ws.on('message', function incoming(message) {
    console.log('received:', message);

    let data = JSON.parse(message);
    influx.writePoints([
      {
        measurement: 'b2dping',
        time: +new Date,
        tags: { tool_id: data.tool_id, recv_bd_addr: data.recv_bd_addr },
        fields: {rssi: data.rssi },
      }
    ])
  });

  ws.on("close", function() {
   console.log("Closing...");
 });

});

console.log("Listening...");
server.listen(8081);

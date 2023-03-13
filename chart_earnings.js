const { tx } = require('@edge/index-utils')
const sqlite3 = require('sqlite3').verbose();
const { open } = require( 'sqlite');

const { ChartJSNodeCanvas, ChartCallback } = require('chartjs-node-canvas');
const { ChartConfiguration } = require('chart.js');
const fs  = require('fs');


async function getAllTransactions() {
  let allTxs = [];
  let page = 1;
  let limit = 10000;
  let txs = await tx.transactions('https://index.xe.network', undefined, { page, limit });
  while (txs.results.length > 0 && page < 60) {
    allTxs = allTxs.concat(txs.results);
    page++;
    txs = await tx.transactions('https://index.xe.network', undefined, { page, limit });
  }
  return allTxs;
}

async function main() {
    // open the database
    const db = await open({
      filename: 'earnings.db',
      driver: sqlite3.Database
    })


    await db.exec('CREATE TABLE IF NOT EXISTS earnings (txid TEXT PRIMARY KEY, date DATETIME, amount REAL)');
    
    const row = await db.get('SELECT MAX(date) AS latestDate FROM earnings');
    const latestDate = new Date(row.latestDate).toLocaleDateString();
    console.log(`Latest date in db: ${latestDate}`);
    
    const currentDate = new Date().toLocaleDateString();
    console.log(`Current date: ${currentDate}`);
    
    // check if we need to update the database
    if (latestDate !== currentDate) {
      let txall = await getAllTransactions();

      console.log(`Retrieved ${txall.length} transactions`)

      txall.forEach((result) => {
        const memo = result.data.memo;
        if (memo !== undefined) {
        if (memo.toLowerCase().includes('invoice payment')) {
          const amount = result.amount / 1000000.0 ;
          const paymentdate = memo.toLowerCase().replace('invoice payment on').trim();
          const date = new Date(paymentdate).toISOString().slice(0, 19).replace('T', ' ');
          const hash = result.hash;

          // Store the earnings in the database
          db.run('INSERT OR REPLACE INTO earnings (txid, date, amount) VALUES (?, ?, ?)', hash, date, amount);
        }

        }
      });
    }
    
    const rows = await db.all('SELECT date, amount FROM earnings ORDER BY date ASC');
    let earningsByDate = {};
    rows.forEach((row) => {
      const date = new Date(row.date).toLocaleDateString();
      // console.log(row.date, date, row.amount);
      if (date !== "Invalid Date") {
        if (!earningsByDate[date]) {
          earningsByDate[date] = 0.0;
        }
        earningsByDate[date] += row.amount;
      } else {
        console.log(`Invalid date: ${row.date}`);
      }
    });
    
    for (const date in earningsByDate) {
      console.log(`Invoice payments on ${date}: ${earningsByDate[date]}`);
    }

      const dates = Object.keys(earningsByDate);
      const earnings = Object.values(earningsByDate);

      const width = 720;
      const height = 512;
	    const configuration = {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [
            {
              label: 'Daily Invoice Payments ($EDGE, On-chain data)',
              data: earnings,
              backgroundColor: '#3e95cd',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1,
            },
          ],
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
            },
          },
        },
        plugins: [{
          id: 'background-colour',
          beforeDraw: (chart) => {
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          }
        }]
      };

      const backgroundColour = 'white'; 
      const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour });
      const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
      fs.writeFileSync('./earnings.png', buffer, {"encoding": 'base64'});
}


main()
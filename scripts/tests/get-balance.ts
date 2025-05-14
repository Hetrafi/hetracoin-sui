import { SuiClient } from '@mysten/sui.js/client';

async function main() {
  const provider = new SuiClient({
    url: 'https://fullnode.testnet.sui.io',
  });
  
  const address = '0xe888930a1d571f7c982357397c7ef2c0e7650309cf58b7340201193592261157';
  const coinType = '0x8667452485be796d6cb4ad2fce0d8e19734c1eb2a673b483186c7dc1b4062369::HetraCoin::HETRACOIN';

  const coins = await provider.getCoins({ 
    owner: address, 
    coinType 
  });
  
  let total = 0n;
  for (const coin of coins.data) {
    total += BigInt(coin.balance);
  }
  
  console.log(`Total HETRA balance: ${Number(total) / 1e9}`);
  console.log(`Number of coin objects: ${coins.data.length}`);
  
  coins.data.forEach((c, i) => {
    console.log(`${i+1}. ${c.coinObjectId}: ${Number(c.balance) / 1e9} HETRA`);
  });
}

main().catch(console.error); 
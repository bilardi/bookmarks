// Reads the S3 prices from the AWS Pricing API and prints them as the parameters of
// the deploy, with the day they were read. Any price not found ends the script
// with an error, and the deploy with it. Usage: npx tsx scripts/s3-prices.ts <region>
import { readPrices } from "./read-prices";

const { params } = await readPrices(process.argv[2] ?? "eu-west-1");
console.log(params.join(" "));

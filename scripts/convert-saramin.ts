import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";

// Column positions in the actual data (header order ≠ data order in this scraped CSV)
const NAME = 0;
const INDUSTRY = 3;
const URL = 7;

const input = readFileSync("saramin_companies.csv");
const [, ...dataRows] = parse(input, {
  bom: true,
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
});

const hasRealUrl = (url: string) => /^https?:\/\/.+/.test(url?.trim());

const results = dataRows
  .filter((r: string[]) => hasRealUrl(r[URL]))
  .map((r: string[]) => ({
    name: r[NAME]?.trim() ?? "",
    url: r[URL]?.trim() ?? "",
    industry: r[INDUSTRY]?.trim() ?? "",
    notes: "",
  }));

const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
const lines = [
  "name,url,industry,notes",
  ...results.map((r: any) => [r.name, r.url, r.industry, r.notes].map(escape).join(",")),
];
writeFileSync("saramin_converted.csv", lines.join("\n"));
console.log(`Done: ${results.length} with website, ${dataRows.length - results.length} filtered out`);

# Newtoad

I want to make a service.

Assume I have a db of korean small and medium sized companies.

Use ts node for scripting.
Use sqlite for storing db.
Use some headless browser like playwright to load the sites.

## Scrape 
Create a folder data/websites
For each website, create a folder.
Within each folder, add assets, add screenshot, create metadata.json about the scraped data.
Append data to db too.

I want a scraper process that
1. googles/web searches for each company.
2. creates a snapshot of the website
3. gathers all the website info and evaluates a site along a few properties, both per website metadata.json and into sqlite.
	- what is their industry
	- what they're selling
	- company size
	- make a screenshot of their website
	- score website: design quality
	- try to figure out which year the website was last modified (design-wise)
	- based on the webpage source, determine, if it's SEO friendly - make a script that gives back a number 0 to 100 how SEO friendly the website is
	- based on the website, determine the style, get main colors out, get mood
	- extract and save images
	- extract copy
4. append to db

## Gallery
 - create a vite, react, tailscale. What's the simplest API that you can think of?
 - create paging, gallery should be : domain and screenshot. User to sort by metadata props, like seo friendliness, when the design was last touched, how nice is the design quality
 - mark tiles visually distinct if there is a new page made for them


## Magic Worker
Have field: upgraded-webpage (count, default by 0)

On details page, show the original screenshot on the left.
Show website colors visually in a color palette.
Show suggested mood colors
Show metadata up top.
Show buttons: 
Create new website
Make a dropdown: more - user can add custom prompt.
Add mood selector - suggest multiple color sets

When I press the button, let's trigger an agent call to claude - make prompt not ask questions, best effort, goal is: create a website for the company, using the metadata. 
Show loading and time elapsed.

Create site_generation table.
Save generation metadata: color board, extra prompt, benchmarking.
for each generated make a new folder under data/domain.something/gen/[uuid]/

Save screenshot of the website full screen, and mobile size - once generated, show the thumbnail as a gallery. 

Website ingest: 
create justfile - https://github.com/casey/just
make it take a csv or whatever for the ingest: just scrape
Do double check if one is already scraped in db, skip them.
just start: start API and vite.
just install: all dependencies.

Have at it!



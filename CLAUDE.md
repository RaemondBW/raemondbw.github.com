# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Architecture

This is a personal portfolio website hosted on GitHub Pages with a custom domain (raemond.com). The repository contains multiple self-contained web projects using different technology stacks:

### Project Structure
- **Main Portfolio** (`/index.html`) - Material Design Lite with Isotope.js filtering
- **React Applications** - Pre-built Create React App projects with static builds
  - `sf-history-guesser/` - GeoGuessr-inspired game with historical SF photos
  - `wordle/` - Custom Wordle clone with word selection features
- **D3.js Visualizations** - Interactive data visualizations
  - `sf_budget/` - SF city budget explorer using D3.js bubble charts
  - `kickstarter/` - Crowdfunding data visualization with generated category pages
- **iOS App Landing** (`DailyCals/`) - Static HTML landing page with custom CSS

### Technology Stack
- **Frontend**: HTML5, CSS3, vanilla JavaScript, Material Design Lite
- **React Apps**: Create React App (pre-built, no source code in repo)
- **Visualizations**: D3.js v3/v4, jQuery for DOM manipulation
- **Styling**: Custom CSS, Material Design Lite, responsive design patterns
- **Hosting**: GitHub Pages with custom domain via CNAME

## Development Workflow

### No Build Process Required
- All projects are either static HTML/CSS/JS or pre-built React applications
- No package.json files - dependencies loaded via CDN
- Direct file editing and git commit/push for deployment

### Working with Different Project Types

**Static Projects (Main portfolio, DailyCals, visualizations):**
- Edit HTML/CSS/JS files directly
- Test locally by opening index.html in browser
- Dependencies loaded from CDNs (Material Design Lite, D3.js, jQuery)

**React Applications (sf-history-guesser, wordle):**
- Production builds only (no source code)
- Contains built static files in `/static/` directories
- Asset manifests for cache busting
- To modify: would need to rebuild from source (not available in this repo)

**Data Visualizations:**
- JSON data files drive D3.js visualizations
- Python script (`kickstarter/categoryData/htmlGenerator.py`) generates category pages
- Update data files to change visualization content

### Deployment
- Automatic via GitHub Pages on push to master branch
- Custom domain configured via CNAME file
- All paths must work with GitHub Pages static hosting constraints

## Common Tasks

### Adding New Portfolio Items
- Edit main `index.html` to add new project cards
- Add images to `/images/` directory
- Use existing card structure and classes for consistency

### Updating Visualizations
- Modify JSON data files in respective project directories
- For Kickstarter data: run `htmlGenerator.py` to regenerate category pages

### Analytics and Tracking
- Google Analytics (G-G45LKW0Y0C) integrated across projects
- Add tracking to new projects for consistency
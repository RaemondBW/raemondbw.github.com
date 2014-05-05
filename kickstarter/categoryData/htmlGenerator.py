categories = ["3D Printing","Crafts","Footwear","Nonfiction","Sculpture","Accessories","DIY Electronics","Gadgets","Painting","Shorts","Action","Dance","Games","People","Small Batch","Animation",
    "Design","Graphic Design","Performance Art","Software","Anthologies","Digital Art","Hardware","Performances","Sound","Apparel","Documentary","Hip-Hop","Periodical","Space Exploration",
    "Art Book","Drinks","Illustration","Photobooks","Spaces","Art","Electronic Music","Indie Rock","Photography","Tabletop Games","Bacon","Events","Installations","Places","Technology","Blues",
    "Experimental","Interactive Design","Poetry","Theater","Calendars","Fabrication Tools","Jazz","Pop","Thrillers","Camera Equipment","Faith","Jewelry","Product Design","Translations",
    "Ceramics","Family","Journalism","Public Art","Video Games","Children's Book","Fantasy","Kids","Publishing","Wearables","Childrenswear","Farms","Latin","Puzzles","Web","Chiptune","Fashion",
    "Literary Journals","R&B","Webseries","Civic Design","Festivals","Metal","Radio & Podcast","Workshops","Classical Music","Fiction","Mixed Media","Ready-to-wear","World Music","Comics",
    "Film & Video","Movie Theaters","Restaurants","Zines","Community Gardens","Fine Art","Music Videos","Robots","Conceptual Art","Flight","Music","Rock","Cookbooks",
    "Food Trucks","Narrative Film","Romance","Country & Folk","Food","Nature","Science Fiction"]

for category in categories:
  html = '<!DOCTYPE html>\n\
  <meta charset="utf-8">\n\
  <head>\n\
    <title>' + category + '</title>\n\
  </head>\n\
  <style>\n\
  \n\
  text {\n\
    font: 15px sans-serif;\n\
    position: absolute;\n\
    z-index: 50;\n\
  }\n\
  \n\
  rect:hover {\n\
          fill: orange;\n\
        }\n\
        \n\
        #tooltip {\n\
          position: absolute;\n\
          width: 250px;\n\
          height: auto;\n\
          padding: 10px;\n\
          z-index: 100;\n\
          background-color: white;\n\
          -webkit-border-radius: 10px;\n\
          -moz-border-radius: 10px;\n\
          border-radius: 10px;\n\
          -webkit-box-shadow: 4px 4px 10px rgba(0, 0, 0, 0.4);\n\
          -moz-box-shadow: 4px 4px 10px rgba(0, 0, 0, 0.4);\n\
          box-shadow: 4px 4px 10px rgba(0, 0, 0, 0.4);\n\
          pointer-events: none;\n\
        }\n\
        \n\
        #tooltip.hidden {\n\
          display: none;\n\
        }\n\
        \n\
        #tooltip p {\n\
          margin: 0;\n\
          font-family: sans-serif;\n\
          font-size: 16px;\n\
          line-height: 20px;\n\
        }\n\
  \n\
  body {\n\
    position: fixed;\n\
    top: 50%;\n\
    left: 50%;\n\
    margin-top: -450px;\n\
    margin-left: -450px;\n\
  }\n\
  \n\
  </style>\n\
  <body>\n\
    <div id="tooltip" class="hidden">\n\
        <p>Category Name: <strong id="name">Important Label Heading</strong></p>\n\
        <!-- <p>Number of Backers: <span id="backers"></span></p>-->\n\
        <p>Amount Raised: <span id="value">100</span></p>\n\
        <!--<p>Number of Projects: <span id="projects"></span></p>\n\
        <p>Success Rate: <span id="rate"></span>%</p> -->\n\
      </div>\n\
  <script src="http://d3js.org/d3.v3.min.js"></script>\n\
  <script>\n\
  \n\
  var diameter = 900,\n\
      format = d3.format(",d"),\n\
      color = d3.scale.category20c();\n\
  \n\
  var bubble = d3.layout.pack()\n\
      .sort(null)\n\
      .size([diameter, diameter])\n\
      .padding(1.5);\n\
  \n\
  var svg = d3.select("body").append("svg")\n\
      .attr("width", diameter)\n\
      .attr("height", diameter)\n\
      .attr("class", "bubble");\n\
  \n\
  function numberWithCommas(x) {\n\
      return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");\n\
  }\n\
  \n\
  var color = d3.scale.category20();\n\
  \n\
  d3.json("' + category + '.json", function(error, root) {\n\
    var node = svg.selectAll(".node")\n\
        .data(bubble.nodes(classes(root))\n\
        .filter(function(d) { return !d.data; }))\n\
      .enter().append("g")\n\
        .attr("class", "node")\n\
        .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });\n\
  \n\
    node.append("circle")\n\
        .attr("r", function(d) { return Math.round(d.r); })\n\
        .style("fill", function(d,i){\n\
          if (i == 0) {\n\
            //return color(i);\n\
            return "white";\n\
          } else {\n\
            return color(i);//(i%19)+1);\n\
          }\n\
        });\n\
  \n\
    node.on("click", function(d) {\n\
      if (typeof d.className === \'undefined\') {\n\
      } else {\n\
        window.location = d.url\n\
      }\n\
    });\n\
    node.on("mouseover", function(d) {\n\
      if (typeof d.className === \'undefined\') {\n\
        d3.select("#tooltip").classed("hidden", true);\n\
      } else {\n\
        var xPosition = parseFloat(d.x) + d.r + 30;\n\
        var yPosition = parseFloat(d.y) - 49;\n\
  \n\
        d3.select("#name")\n\
          .text(d.className);\n\
        d3.select("#value")\n\
          .text(d.value);\n\
  \n\
        /*d3.select("#backers")\n\
          .text(numberWithCommas(d.backers));\n\
  \n\
        d3.select("#projects")\n\
          .text(numberWithCommas(d.projects));\n\
  \n\
        d3.select("#rate")\n\
          .text((d.successful/d.projects*100).toFixed(1));*/\n\
  \n\
        //Update the tooltip position and value\n\
        d3.select("#tooltip")\n\
          .style("left", xPosition + "px")\n\
          .style("top", yPosition + "px")           \n\
          .select("#value")\n\
          .text("$" + numberWithCommas(d.value.toFixed(2)));\n\
       \n\
        //Show the tooltip\n\
        d3.select("#tooltip").classed("hidden", false);\n\
      }\n\
    });\n\
  \n\
    /*node.append("text")\n\
        .attr("dy", ".3em")\n\
        .style("text-anchor", "middle")\n\
        .text(function(d) { if (d.r > 60) { return d.className;} });*/\n\
  \n\
    // Returns a flattened hierarchy containing all leaf nodes under the root.\n\
    function classes(root) {\n\
      var classes = [];\n\
      root.data.forEach(function (value) { classes.push({className: value.title, value: value.totalPledged, backers: value.backers, successful: value.successful, url:value.link})});\n\
      return {children: classes};\n\
    }\n\
  \n\
    d3.select(self.frameElement).style("height", diameter + "px");\n\
  });\n\
  \n\
  </script>\n\
  </body>'
  f = open(category + ".html", 'w')
  f.write(html)
  f.close()

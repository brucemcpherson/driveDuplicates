/**
 * figure out dups on drive
 * see settings namespace for parameters
 * to try to minimize quota usage
 * the approach is to weed out as much as posible 
 * before looking at the folders/file relationship
 */
function dupsOnMyDrive() {
  
  // the settings
  var se = Settings.drive;
  var sr = Settings.report;
  var fiddler = new cUseful.Fiddler();
  var cache = CacheService.getUserCache();
  
  // get the start folder
  var startFolder = cUseful.DriveUtils
  .setService(DriveApp)
  .getFolderFromPath (se.startFolder);
  
  // get all the folders that are good
  var cacheKey = cUseful.Utils.keyDigest (se.startFolder, "driveCleaning");
  var cached = se.useCache ? cache.get(cacheKey) : null;
  var allFolders = cached ? JSON.parse(cUseful.Utils.uncrush(cached)) :
    getEligibleFolders(startFolder,se.startFolder) ;

  // using cache , but zipping 
  cache.put (cacheKey , cUseful.Utils.crush (allFolders), se.cacheSeconds);


  // now get all the files on Drive of this mimetype
  if (se.search) {
    var searchTerm = se.search + (se.mime ? " and mimeType = '" + se.mime +"'": "");
    var files = cUseful.Utils.expBackoff (function () {
      return DriveApp.searchFiles(se.search);
    });
  }
  else {
    var files = cUseful.Utils.expBackoff (function () {
      return se.mime ? DriveApp.getFilesByType(se.mime) : DriveApp.getFiles();
    });
  }
  // get them as a pile
  var smallerPile = getAllTheFiles (files);

  
   // write the data to the sheet
  var ss = SpreadsheetApp.openById(sr.sheetId);
  var sh = ss.getSheetByName(sr.sheetName);
  
  // if if does exist, create it.
  if (!sh) {
    sh = ss.insertSheet(sr.sheetName);
  }
  
  // clear it
  sh.clearContents();
  
  // set up the data to write to a sheet
  if (Object.keys(smallerPile).length) {
    fiddler.setData (Object.keys(smallerPile).map(function(k) {
      return smallerPile[k];
    }))
    .filterRows(function (row) {
      // only report on those that are above the threshold
      return row.count >= sr.min;
    })
    .mapRows(function (row) {
      row.paths = row.paths.join(",");
      row.mimes = row.mimes.join(",");
      return row;
    })
    .filterColumns (function (name) {
      // dump the id and the key and the path
      return name !== "id" && name !== "key" && name !== "path" && name !== "mime";
    })
    .getRange(sh.getDataRange())
    .setValues(fiddler.createValues());
  }
  // get all the folders that are below the start folder
  function getEligibleFolders(startFolder,path,allFolders) {
    allFolders = allFolders || [];

    var foldit = startFolder.getFolders();
    var folders = [];
    while (foldit.hasNext()) {
      folders.push(foldit.next());
    }
    
    // add the parent folder
    allFolders.push (getFob(startFolder, path));
    
    // recurse
    if (se.recurse) {
      folders.forEach (function (d) {
        return getEligibleFolders (d, path+d.getName()+"/", allFolders);
      });
    }
    function getFob(folder,path) {
      
      return {
        id:folder.getId(),
        name:folder.getName(),
        path:path
      };
    
    }
    return allFolders;
  }
  
  /**
   * get all the files but drop those that there are less than threshold
   * @param {FileIterator} files the files
   * @return {Array.object} the files
   */
  function getAllTheFiles (files) {
    
    // list of files will be here
    var pile = [];
    
    // that just makes them easier to dealwith
    while(files.hasNext()) {
      var file = files.next();
      pile.push(file);
    };

    // now make an object keyed on the the names
    var fileOb = pile.reduce (function (p,c) {
      var key = se.acrossMimes ?  c.getName() : c.getName() + c.getMimeType() ;
      if (!p.hasOwnProperty(key)) {
        p[key] = {
          file:c,
          key:key,
          count:0
        }
      }
      p[key].count++;
      return p;
    },{});

    
    // make a reduced pile, of files that are potential dups
    // and add the parents
    var reducedPile = pile.map(function (d) {
      var key = se.acrossMimes ?  d.getName() : d.getName() + d.getMimeType() ;
      return fileOb[key].count >= sr.min ? d : null;
    })
    .filter(function(d) {
      return d;
    })
    .map(function(d) {

      // now get the parents
      var parents = [];
      var parentIt = d.getParents();
      while (parentIt.hasNext()) {
        var parent = parentIt.next();
        var targets = allFolders.filter(function(e) {
          return parent.getId() === e.id;
        });
        // now store those parents
        targets.forEach(function(e) {
          parents.push (e);
        });
      }

      // if this is true, then its an interesting file
      var key = se.acrossMimes ?  d.getName() : d.getName() + d.getMimeType() ;
      var fileOb = parents.length ? {
        id:d.getId(),
        name:d.getName(),
        mime:d.getMimeType(),
        path:parents[0].path + d.getName(),
        key: se.acrossFolders ? key : parents[0].id + key
      } :null;
      if (parents.length > 1) {
        Logger.log(fileOb.path + ' had ' + parents.length + ' parents: only used the first');
      }
      return fileOb;
    })
    .filter (function(d) {
      //  filter out those that were not of interest
      return d;
    });
    
    // finally, if we need to take account of folders to weed out dups, then do all that again 
    // now that we know the parents

    var fileOb = reducedPile.reduce (function (p,c) {
      if (!p.hasOwnProperty(c.key)) {
        p[c.key] = c;
        c.count = 0;
        c.paths = [];
        c.mimes = [];
      }
      p[c.key].count++;
      // concat paths/mimes if more than one
      if (!p[c.key].paths.some(function (d) { return c.path === d; })) {
          p[c.key].paths.push(c.path);
      }
      if (!p[c.key].mimes.some(function (d) { return c.mime === d; })) {
          p[c.key].mimes.push(c.mime);
      }
      return p;
    },{});


    // further weed out
    return Object.keys (fileOb).map(function (d) {
      return fileOb[d].count >= sr.min ? fileOb[d] : null;
    })
    .filter (function(d) {
      return d;
    });
  }

}

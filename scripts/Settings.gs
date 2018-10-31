var Settings = (function(ns) {
  
  ns.drive = {
    dapi:DriveApp,                             // Use DriveApp api
    startFolder:"/",                            // folder path to start looking
    mime:"application/vnd.google-apps.script", // mime type to look for
    recurse:true,                              // whether to recurse through folders
    acrossFolders:true,                       // whether to count files with same name in different folders as duplicate
    acrossMimes:false,                         // whether to count files with same name but different mimes as the same
    useCache:true,                             // whether to use cache for folder maps
    cacheSeconds:60*60,                        // how long to allow cache for
    search:""                                  // can use any of https://developers.google.com/drive/v3/web/search-parameters
  };
  ns.report = {
    sheetId:"1Ef4Ac5KkipxvhpcYCe9C_sx-TnD_kvV2E_a211wS6Po",  // sheet id to write to
    sheetName:'dups-'+ns.drive.startFolder+"-"+ns.drive.mime,  // sheetName to write to
    min:2                                     // min count to report on
  };
   
  return ns;
})(Settings || {});

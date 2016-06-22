var GedcomParser = require('./index');

var path = '/Users/benoitlecluse/Downloads/COSNEFROY-PACHECO.GED.ged';
var parser = new GedcomParser();

parser.parse(path, function(parser){
  var files = parser.getDataOfType('FILE');
  var list;
  for (var i in files) {
    files[i].pointers = parser.getTopPointers(files[i].pointers);
    path = files[i].content;

    for (var j in files[i].pointers) {
      // Résultat  => chemon, ref individu
      console.log(path, files[i].pointers[j]);
    }
  }
});


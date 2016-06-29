"use strict";

var _       = require('underscore');
var fs      = require('fs');
var chardet = require('chardet');
var iconv = require('iconv-lite');

function GedcomParser(path, callback){
  // Utils regex (line...)
  this.levelRegex = '[0-9]{1,2}';
  this.tagRegex = '[0-9a-zA-Z]{1,31}';
  this.pointerRegex = '@[0-9a-zA-Z]+[0-9a-zA-Z# ]{0,1}@';
  this.pointerLineRegex = new RegExp('^('+[this.levelRegex, this.pointerRegex, this.tagRegex].join(') (')+')');
  this.dataLineRegex = new RegExp('^('+[this.levelRegex, this.tagRegex].join(') (')+')'+'[ ]*(.*)$');


  this.lines = [];
  this.nextLineStart = "";

  this.currentLevel = 0;

  this.currentId = null;
  this.currentParentId = 0;
  this.currentPointer;

  this.data = [];
  this.relations = [];
  this.pointersRelations = [];

  this.history = [];
}


GedcomParser.prototype.parse = function(path, callback){
  // Encoding dectection
  var that = this;
  var encodingContent = '';
  var encoding;

  var encodingStream = fs.createReadStream(path);
  encodingStream.on('data', function(chunk) {
      encodingContent += chunk.toString('utf-8');
      var matches = encodingContent.match(/[0-9]{1,2} CHAR ([A-Za-z0-9_-]+)/);
      if (matches) {
        encoding = matches[1].toLowerCase();
        encodingStream.destroy();
      }
  });

  var parseFile = function() {
    // Première lecture pour l'encodage
    that.readableStream = fs.createReadStream(path)
      .pipe(iconv.decodeStream(encoding))
      .pipe(iconv.encodeStream('utf-8'));

    that.readableStream.on('data', function(chunk) {
        that.lines = chunk.toString('utf-8').replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
        // Save the next line start for next chunk
        that.lines[0] = that.nextLineStart+that.lines[0]
        that.nextLineStart = that.lines.pop();
        // Parse the lines
        for (var i in that.lines) {
          that.readLine(that.lines[i].trim());
        }
    });

    that.readableStream.on('end', function() {
      callback(that);
    });
  }

  encodingStream.on('close', parseFile);
  encodingStream.on('end', parseFile);

}

// Read line
GedcomParser.prototype.readLine = function(line){
  var lineLevel, dataType, content, isPointer, isData;
  if (isPointer = line.match(this.pointerLineRegex)) {
    lineLevel = isPointer[1];
    this.currentPointer = isPointer[2];
  } else if (isData = line.match(this.dataLineRegex)) {
    lineLevel = isData[1];
    dataType = isData[2];
    content = isData[3];
    if (content.match(this.pointerRegex)){
      this.pointersRelations.push({
        reference : content,
        refersTo : this.currentPointer,
        type : dataType
      });
    } else {
      this.insertData(dataType, content, lineLevel);
    }
  }
}


// Parse line
GedcomParser.prototype.insertData = function(dataType, content, lineLevel){
  // if higher level push in history
  if (this.currentLevel < lineLevel) {
    this.history.push(this.currentId);
    this.currentParentId = this.history[this.history.length-1];
  }

  // if higher go back in history
  if (this.currentLevel > lineLevel) {
    while (this.currentLevel != lineLevel){
      this.currentParentId = this.history.pop();
      this.currentLevel --;
    }
  }

  this.currentId++;

  // Store in data
  this.data.push({
    dataType : dataType,
    content : content,
    pointers: [this.currentPointer],
    id : this.currentId
  });

  // Store link
  this.currentLevel = lineLevel;
  this.relations.push({
    parent: this.currentParentId,
    child : this.currentId
  });
}

// Get last pointer
GedcomParser.prototype.getTopPointers = function(pointers){
  var that = this;
  var localTops = [];
  _.each(pointers, function(_pointer){
    var _tops = [];
    if (typeof(_pointer) == "undefined") {
      _tops = [];
    } else if (_pointer.match(/^@I/) || _pointer.match(/I@$/)) {
      localTops.push(_pointer);
    } else {
      var _tops = _.where(that.pointersRelations, {reference: _pointer});
    }
    _.each(_tops, function(_top){
      if (typeof(_top) != 'undefined') {
        localTops.push(_top.refersTo);
      }
    });
  });
  localTops.sort();
  localTops = _.uniq(localTops, true);
  if (_.isEqual(localTops, pointers) ) {
    return localTops;
  } else {
    return that.getTopPointers(localTops);
  }
}

// Obtain data of a specific type
GedcomParser.prototype.getDataOfType = function(type){
  return _.filter(this.data, function(dataSet){
    return dataSet.dataType == type;
  });
}

// Obtain a node from id
GedcomParser.prototype.fromId = function(id){
  return _.findWhere(this.data, {id: id});
}

// Obtain parent of a node
GedcomParser.prototype.getParent = function(node) {
  var parentId = _.findWhere(this.relations, {child: node.id}).parent;
  return _.findWhere(this.data, {id: parentId});
}

// Obtain the siblings of a node
GedcomParser.prototype.getSiblings = function(node) {
  var that = this;
  var parentRelation = _.findWhere(this.relations, {child: node.id});
  if (typeof(parentRelation) == 'undefined') {
    return [];
  }

  var siblingsIds = _.where(this.relations, {parent: parentRelation.parent});
  _.each(siblingsIds, function(sibiling){
    siblings = that.fromId(sibiling.child);
  });
  return siblings;
}

// Obtain a children list
GedcomParser.prototype.getChildren = function(node) {
  var that = this;
  var children = [];
  var childrenId = _.where(this.relations, {parent: node.id});
  _.each(childrenId, function(sibiling){
    children = that.fromId(sibiling.child);
  });

  return children;
}

module.exports = GedcomParser;

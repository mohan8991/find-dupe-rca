'use strict';
const path = require('path');
const fs = require('fs');
var convert = require('xml-js');

const color = {
    error : "\x1b[31m%s\x1b[0m",
    warning: "\x1b[33m%s\x1b[0m",
    success: "\x1b[32m%s\x1b[0m"
}

const searchPropfs = fs.readFileSync('search-prop.json');
const searchProp = JSON.parse(searchPropfs);

let filesToSearch = [];
let dupeRCA = [];
let map_RCA = {};
let fields = searchProp.fields;

const getAllFiles = (dirPath, arrayOfFiles) => {
    let files = fs.readdirSync(dirPath)
    arrayOfFiles = arrayOfFiles || []

    files.forEach((file) => {
        if (!searchProp.ignore.includes(file)) {
            if (fs.statSync(dirPath + "/" + file).isDirectory()) 
                arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles)
            else
                if (checkFileExt(file))
                    arrayOfFiles.push(path.join(dirPath, "/", file))
            
        }
    })

    return arrayOfFiles
}

const checkFileExt = (fileName) => {
    let isFileAllowed = false;
    searchProp.fileExtnToSearch.forEach((allowedFileExt) => {
        isFileAllowed = fileName.indexOf(allowedFileExt) != -1;
    })
    return isFileAllowed;
}

const readXML = (filePath) => {
    try {
        var xml = fs.readFileSync(filePath, 'utf8');
        var options = {
            ignoreComment: true,
            alwaysChildren: true,
            ignoreDeclaration: true,
            ignoreAttributes: false
        };
        var result = JSON.parse(convert.xml2json(xml, options));
        let action;

        if('attributes' in result.elements[0] && 'action' in result.elements[0].attributes)
            action = result.elements[0].attributes.action;
        else if('attributes' in result.elements[0].elements[0] &&  'action' in result.elements[0].elements[0].attributes)
            action = result.elements[0].elements[0].attributes.action;

        //to include formatted xmls
        result = result.elements[0].elements[0].elements.length > 1 ? result.elements[0].elements[0].elements : result.elements[0].elements;
        result.push({ name: 'action', elements: [{type: 'text', text: action}]})
        return result;
    } catch (e) {
        console.error(color.error, "Error parsing file: ")
        console.error(color.error, filePath)
    }
}

const getFieldValue = (xmlJSON, fieldName) => {
    let val = ""
    xmlJSON.forEach((field) => {
        if (field.name == fieldName && field.elements.length > 0) {
            if (checkSourceTargetFields(field)) {
                let table = field.name === 'source' ? field.attributes.source_table : field.attributes.target_table;
                val = field.attributes.name + "|" + table;
                val = table == 'sys_dictionary' ? val + "|" + field.attributes.element : val;
            } else
                val = field.elements[0].text;
        }
    })
    return val;
}

const checkSourceTargetFields = (field) => {
    if (!field.hasOwnProperty('attributes'))
        return false;
    if (field.name === 'source')
        return (field.attributes.source_table == 'sys_db_object' || field.attributes.source_table == 'sys_dictionary');
    else if (field.name === 'target')
        return (field.attributes.target_table == 'sys_db_object' || field.attributes.target_table == 'sys_dictionary');
}

try {
    console.log("Scanning repo ");
    searchProp.repos.forEach((repo) => {
        
        dupeRCA = [];

        console.log(repo);
        console.log("----------------------------------");
        let path = searchProp.gitLocation + repo;
        
        if (!fs.existsSync(path)){
            console.error(color.error, "Directory not found " + path);
            console.log("\n");
            return;
        }

        filesToSearch = getAllFiles(searchProp.gitLocation + repo)
        console.log("Total number of RCA records " + filesToSearch.length);
        filesToSearch.forEach((file) => {
            let fieldVal = [];
            fields.forEach((field) => {
                fieldVal.push(getFieldValue(readXML(file), field));
            })

            const key = fieldVal.join("|");
            const value = file;

            if (map_RCA[key])
                dupeRCA.push(map_RCA[key] + " -> " + file)
            else
                map_RCA[key] = value;
        })

        if (dupeRCA.length > 0) {
            console.log(color.error, dupeRCA.length + " duplicate RCA's found");
            dupeRCA.forEach((dupe) => {
                console.log(color.error, dupe)
            })
        } else
            console.log(color.success, "No Duplicates");

        console.log("\n");
    })
} catch (e) {
    console.log("\n");
    console.error(color.error, e);
}
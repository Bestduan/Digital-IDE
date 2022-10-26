"use strict";

const fs       = require("fs");
const vscode   = require("vscode");
const parser   = require("HDLparser");
const filesys  = require("HDLfilesys");
const instance = require("./instance");

class testbench {
    constructor() {

    }

    
}

function Overwrite_tb(opeParam) {
    let tbSourcePath = "";
    vscode.window.showQuickPick(['vlog','vhdl'],{placeHolder:"Which type you want to Overwrite?"}).then(select => {
        if (select == "vlog") {
            tbSourcePath = `${opeParam.rootPath}/lib/src_lib/Hardware/testbench.v`;
        } else if (select == "vhdl") {
            tbSourcePath = `${opeParam.rootPath}/lib/src_lib/Hardware/testbench.vhd`;
        }
        const options = {
            preview: false,
            viewColumn: vscode.ViewColumn.Active
        };
        vscode.window.showTextDocument(vscode.Uri.file(tbSourcePath), options);
    });
}
exports.Overwrite_tb = Overwrite_tb;

function genInstancetoTbFile(indexer, opeParam, uri) {
    vscode.window.showSaveDialog({ 
        filters: {
            verilog: ["v", "V", "vh", "vl"], // 文件类型过滤
            vhdl: ["vhd", "vhdl", "vho", "vht"], // 文件类型过滤
        },
    }).then(fileInfos => {
        let path_full = fileInfos === null || fileInfos === void 0 ? void 0 : fileInfos.path;
        if (path_full !== undefined) {
            if (path_full[0] === '/' && require('os').platform() === 'win32') {
                path_full = path_full.substring(1);
            }
            let docPath = uri.fsPath;
            parser.utils.selectCurrentFileModule(indexer.HDLparam, docPath).then(selectModule => {
                if (selectModule != null) {
                    let languageId = parser.utils.getLanguageId(docPath);
                    if (languageId == "verilog") {
                        let inst = instance.instantiateVlogModule(selectModule);
                        insertInstContent(inst, path_full, opeParam.rootPath);
                    } else if (languageId == "vhdl") {
                        let inst = instance.instantiateVhdlModule(selectModule);
                        insertInstContent(inst, path_full, opeParam.rootPath);
                    }
                }
            })
        }
    });
}
exports.genInstancetoTbFile = genInstancetoTbFile;

function insertInstContent(content, tbFilePath, rootPath) {
    let newContent = "";
    let oldContent = "";
    if (fs.existsSync(tbFilePath)) {
        oldContent = fs.readFileSync(tbFilePath, "utf-8");
    } else {
        let tbSource = `${rootPath}/lib/src/Hardware`;
        let LanguageId = parser.utils.getLanguageId(tbFilePath);
        if (LanguageId == "verilog") {
            oldContent = fs.readFileSync(`${tbSource}/testbench.v`, "utf-8");
        }
        else if (LanguageId == "vhdl") {
            oldContent = fs.readFileSync(`${tbSource}/testbench.vhd`, "utf-8");
        }
    }
    let lines = oldContent.split('\n');
    let len = lines.length;
    for (let index = 0; index < len; index++) {
        const line = lines[index];
        newContent = newContent + line + '\n';
        if (line.indexOf("//Instance ") != -1) {
            newContent = newContent + content + '\n';
        }
    }
    fs.writeFileSync(tbFilePath, newContent, "utf-8");
}

function appiontInsert(position, content) {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
        return;
    }

    editor.edit((editBuilder) => {
        editBuilder.insert(position, content);
    });
}
exports.appiontInsert = appiontInsert;
"use strict";

const vscode  = require("vscode");
const parser  = require("HDLparser");
const filesys = require("HDLfilesys");

const xilinx  = require("./xilinx");

class hardwareRegister {
    constructor (process) {
        this.process = process;
        this.process.hardware = this;
        this.process.terminal = this.getTerminal('HardWare');

        this.xilinxOpe = new xilinx(process);

        this.log  = vscode.window.showInformationMessage;
        this.err  = vscode.window.showErrorMessage;
        this.warn = vscode.window.showWarningMessage;
        this.setting = vscode.workspace.getConfiguration();
        
        this.getConfig();
        var _this = this;
        vscode.workspace.onDidChangeConfiguration(function () {
            _this.getConfig();
        });

        vscode.window.onDidCloseTerminal((terminal) => {
            if (terminal.name == "HardWare") {
                _this.process.terminal = null;
                let prjInfo = _this.process.opeParam.prjInfo;
                if (!filesys.files.isHasAttr(prjInfo, "TOOL_CHAIN")) {
                    return null;
                }
                switch (prjInfo.TOOL_CHAIN) {
                    case "xilinx":
                        _this.xilinxOpe.move_bd_ip();
                    break;
                
                    default: break;
                }
            }
        });

        // vscode.window.registerTerminalLinkProvider({
        //     provideTerminalLinks: (context, token)=> {
        //         if (context.line.indexOf("Exiting Vivado") != -1) {
        //             vscode.window.showInformationMessage(context.line);
        //         }
        //     },
        //     handleTerminalLink: (link)=> {
        //       vscode.window.showInformationMessage(`Link activated (data=${link.data})`);
        //     }
        // });
    }

    getConfig() {
        this.xilinxInstallPath = this.setting.get('TOOL.vivado.install.path');
        this.vivadoPath = "vivado";
        if (this.xilinxInstallPath != "") {
            this.vivadoPath = this.xilinxInstallPath.replace(/\\/g,"\/");
            if (this.process.opeParam.os == "win32") {
                this.vivadoPath = this.vivadoPath + "vivado.bat";
            }
        }
    }

    isLegal() {
        let prjInfo = this.process.opeParam.prjInfo;
        if (!filesys.files.isHasAttr(prjInfo, "TOOL_CHAIN")) {
            return false;
        }

        let terminal = this.process.terminal;
        if (!terminal) {
            return false;
        }

        return {
            tool_chain : prjInfo.TOOL_CHAIN,
            terminal : terminal,
        }
    }
    
    launch() {
        let prjInfo = this.process.opeParam.prjInfo;
        let terminal = this.process.terminal;
        if (prjInfo) {
            let tool_chain = this.process.opeParam.prjInfo.TOOL_CHAIN;
            if (!tool_chain) {
                return null;
            }
            if (!terminal) {
                terminal = this.getTerminal('HardWare');
                if (terminal) {
                    this.process.terminal = terminal;
                } else {
                    terminal = vscode.window.createTerminal({ name: 'HardWare' });
                    this.process.terminal = terminal;
                }
                terminal.show(true);
            }
            switch (tool_chain) {
                case "xilinx":
                    let argu = `-notrace -nolog -nojournal`
                    let scriptPath = this.xilinxOpe.launch();
                    terminal.sendText(`${this.vivadoPath} -mode tcl -s ${scriptPath} ${argu}`);
                break;
            
                default: break;
            }
        } else {
            let prjFileList = filesys.files.pickAllFile(this.process.opeParam.workspacePath, ".xpr");
            if (prjFileList.length) {
                this.xilinxOpe.gui("direct", this.vivadoPath, prjFileList[0]);
            }
        }
    }

    refresh() {
        let result = this.isLegal();
        if (!result) {
            return null;
        }

        switch (result.tool_chain) {
            case "xilinx":
                let scriptPath = this.xilinxOpe.refresh();
                result.terminal.sendText(`source ${scriptPath} -notrace`);
            break;
        
            default: break;
        }
    }

    simulate() {
        let result = this.isLegal();
        if (!result) {
            return null;
        }

        switch (result.tool_chain) {
            case "xilinx":
                let scriptPath = this.xilinxOpe.simulate();
                result.terminal.sendText(`source ${scriptPath} -notrace`);
            break;
        
            default: break;
        }
    }

    build() {
        let result = this.isLegal();
        if (!result) {
            return null;
        }

        switch (result.tool_chain) {
            case "xilinx":
                let scriptPath = this.xilinxOpe.build();
                result.terminal.sendText(`source ${scriptPath} -notrace`);
            break;
        
            default: break;
        }
    }

    synth() {
        let result = this.isLegal();
        if (!result) {
            return null;
        }

        switch (result.tool_chain) {
            case "xilinx":
                this.xilinxOpe.synth();
            break;
        
            default: break;
        }
    }

    impl() {
        let result = this.isLegal();
        if (!result) {
            return null;
        }

        switch (result.tool_chain) {
            case "xilinx":
                this.xilinxOpe.impl();
            break;
        
            default: break;
        }
    }

    generateBit() {
        let result = this.isLegal();
        if (!result) {
            return null;
        }

        switch (result.tool_chain) {
            case "xilinx":
                let scriptPath = this.xilinxOpe.generateBit();
                result.terminal.sendText(`source ${scriptPath} -notrace`);
            break;
        
            default: break;
        }
    }

    program() {
        let result = this.isLegal();
        if (!result) {
            return null;
        }

        switch (result.tool_chain) {
            case "xilinx":
                let scriptPath = this.xilinxOpe.program();
                result.terminal.sendText(`source ${scriptPath} -notrace`);
            break;
        
            default: break;
        }
    }

    outputLog(logPath) {
        let prjInfo = this.process.opeParam.prjInfo;
        if (!filesys.files.isHasAttr(prjInfo, "TOOL_CHAIN")) {
            return false;
        }

        switch (prjInfo.TOOL_CHAIN) {
            case "xilinx":
                this.xilinxOpe.xExecShowLog(logPath);
            break;
        
            default: break;
        }
    }

    gui() {
        let result = this.isLegal();
        if (!result) {
            return null;
        }

        switch (result.tool_chain) {
            case "xilinx":
                this.xilinxOpe.gui("terminal");
                result.terminal.show(false);
            break;
        
            default: break;
        }
    }

    exit() {
        let terminal = this.process.terminal;
        if (!terminal) {
            return null;
        }

		terminal.show(true);
		terminal.sendText(`exit`);
        terminal.sendText(`exit`);
        this.process.terminal = null;
		this.xilinxOpe.move_bd_ip();
    }

    boot() {
        let prjInfo = this.process.opeParam.prjInfo;
        if (!filesys.files.isHasAttr(prjInfo, "TOOL_CHAIN")) {
            return null;
        }

        switch (prjInfo.TOOL_CHAIN) {
            case "xilinx":
                this.xilinxOpe.boot();
            break;
        
            default: break;
        }
    }

    clean() {
        let terminal = this.process.terminal;
        if (terminal) {
            this.warn("The HardWare terminal still exists, can not clean.")
            return null;
        }

        let prjInfo = this.process.opeParam.prjInfo;
        if (!filesys.files.isHasAttr(prjInfo, "TOOL_CHAIN")) {
            return null;
        }

        switch (prjInfo.TOOL_CHAIN) {
            case "xilinx":
                this.xilinxOpe.clean();
            break;
        
            default: break;
        }
    }

    setSrcTop(uri) {
        let HDLparam = this.process.indexer.HDLparam;
        parser.utils.selectCurrentFileModule(HDLparam, uri.fsPath).then((selecModule) => {
            if (selecModule == null) {
                return null;
            }
            this.process.opeParam.srcTopModule = {
                name : selecModule.moduleName,
                path : selecModule.modulePath,
            }

            let treeView = this.process.treeView;
            if (treeView) {
                treeView.refresh();
            }

            let prjInfo = this.process.opeParam.prjInfo;
            let terminal = this.process.terminal;
            if (!prjInfo) {
                return null;
            }
            let tool_chain = this.process.opeParam.prjInfo.TOOL_CHAIN;
            if (!tool_chain) {
                return null;
            }
            if (!terminal) {
                return null;
            }
            switch (tool_chain) {
                case "xilinx":
                    let command = `set_property top ${selecModule.moduleName} [current_fileset]`;
                    terminal.sendText(command);
                break;
            
                default: break;
            }
        })
    }

    setSimTop(uri) {
        let HDLparam = this.process.indexer.HDLparam;
        parser.utils.selectCurrentFileModule(HDLparam, uri.fsPath).then((selecModule) => {
            if (selecModule == null) {
                return null;
            }
            this.process.opeParam.tbFilePath = selecModule.modulePath;
            this.process.opeParam.simTopModule = {
                name : selecModule.moduleName,
                path : selecModule.modulePath,
            }

            let treeView = this.process.treeView;
            if (treeView) {
                treeView.refresh();
            }

            let prjInfo = this.process.opeParam.prjInfo;
            let terminal = this.process.terminal;
            if (!prjInfo) {
                return null;
            }
            let tool_chain = this.process.opeParam.prjInfo.TOOL_CHAIN;
            if (!tool_chain) {
                return null;
            }
            if (!terminal) {
                return null;
            }
            switch (tool_chain) {
                case "xilinx":
                    let command = `set_property top ${selecModule.moduleName} [get_filesets sim_1]`;
                    terminal.sendText(command);
                break;
            
                default: break;
            }
        })
    }

    getTerminal(name) {
        for (let index = 0; index < vscode.window.terminals.length; index++) {
            const terminalElement = vscode.window.terminals[index];
            if (terminalElement.name == name) {
                return terminalElement;
            }
        }
        return null;
    }
}
exports.hardwareRegister = hardwareRegister;
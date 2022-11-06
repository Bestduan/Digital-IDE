"use strict";

const fs     = require("../../HDLfilesys");
const vscode = require("vscode");
const child  = require("child_process");

/**
 * 生命周期 
 */
class xilinxOperation {
    constructor(process) {
        this.process  = process;
        this.setting  = vscode.workspace.getConfiguration;
        this.register = vscode.commands.registerCommand;
        this.outputCH = vscode.window.createOutputChannel("xilinx");

        this.register('xilinx.Add_bd', (uri) => {this.Add_bd(uri)});
        this.register('xilinx.Delete_bd', () => {this.Delete_bd()});
        this.register('xilinx.Overwrite_bd', (uri) => {this.Overwrite_bd(uri)});
    }

    /**
     * @state finish-untested
     * @descriptionCn xilinx下的launch运行，打开存在的工程或者再没有工程时进行新建
     * @param {Object} opeParam 全局操作参数
     * @returns {String} 需要执行的脚本路径
     */
    launch(opeParam) {
        // 视之为标准文件结构
        let script = '';
        let scripts = [];
        let prjFilePath = opeParam.prjStructure.prjPath;
        let prjFiles = fs.files.pickFileFromExt(prjFilePath, {
            exts : ".xpr",
            type : "all",
            ignores : []
        });
        
        // 找到工程文件，如果找到就直接打开，找不到就根据配置信息新建工程。
        if (prjFiles.length) {
            if (prjFiles.length > 1) {
                vscode.window.showQuickPick(prjFiles, {
                    placeHolder : "Which project you want to open?"
                }).then((selection) => {
                    this.open(selection, scripts);
                });
            } else {
                prjFilePath = prjFiles[0];
                this.open(prjFilePath, scripts);
            }
        } else {
            prjFilePath = `${prjFilePath}/xilinx`;
            fs.dirs.mkdir(prjFilePath);
            this.create(prjFilePath, scripts);
        }

        // 根据配置信息进行源文件导入
        for (let i = 0; i < scripts.length; i++) {
            const content = scripts[i];
            script += content + '\n';
        }
        let scriptPath = this.refresh();
        script += `source ${scriptPath} -notrace\n`;
        scriptPath = `${opeParam.rootPath}/resources/script/xilinx/launch.tcl`;
        script += `file delete ${scriptPath} -force\n`;
        fs.files.writeFile(scriptPath, script);
        return scriptPath;
    }

    /**
     * @state finish-untested
     * @descriptionCn 在指定的路径之下进行
     * @param {String} prjFilePath 
     * @param {Array} scripts 
     */
    create(prjFilePath, scripts) {
        this.prjName = "template";
        this.device  = "xc7z020clg400-2";

        // 获取工程名
        if (fs.files.isHasAttr(this.process.opeParam.prjInfo, "PRJ_NAME.FPGA")) {
            this.prjName = this.process.opeParam.prjInfo.PRJ_NAME.FPGA;
        }

        // 获取器件名
        if (fs.files.isHasAttr(this.process.opeParam.prjInfo, "Device")) {
            this.device = this.process.opeParam.prjInfo.Device;
        }

        scripts.push(`set_param general.maxThreads 8`);
        scripts.push(`create_project ${this.prjName} ${prjFilePath} -part ${this.device} -force`);
        scripts.push(`set_property SOURCE_SET sources_1   [get_filesets sim_1]`);
        scripts.push(`set_property top_lib xil_defaultlib [get_filesets sim_1]`);
        scripts.push(`update_compile_order -fileset sim_1 -quiet`);
    }

    open(path, scripts) {
        scripts.push(`set_param general.maxThreads 8`);
        scripts.push(`open_project ${path} -quiet`);
    }

    refresh() {
        let scripts = [];
        let opeParam = this.process.opeParam;
        let prjStructure = opeParam.prjStructure;
        let prjFilePath = `${opeParam.prjStructure.prjPath}/xilinx`;
        let hardwarePath = path.dirname(prjStructure.HardwareSrc);
        // 清除所有源文件
        scripts.push(`remove_files -quiet [get_files]`);

        // 导入 IP_repo_paths
        scripts.push(`set xip_repo_paths {}`);
        let xip_repo_path = this.setting().get('PRJ.xilinx.IP.repo.path');
        if (fs.files.isExist(xip_repo_path)) {
            scripts.push(`lappend xip_repo_paths ${xip_repo_path}`);
        }

        let xip_repo_libs = opeParam.prjInfo.IP_REPO;
        let xip_repo_lib_path = `${opeParam.rootPath}/IP_repo`;
        if (xip_repo_libs) {
            for (let index = 0; index < xip_repo_libs.length; index++) {
                const element = xip_repo_libs[index];
                switch (element) {
                    case "arm":
                        scripts.push(`lappend xip_repo_paths ${xip_repo_lib_path}/arm`);
                    break;
                    case "adi":
                        scripts.push(`lappend xip_repo_paths ${xip_repo_lib_path}/adi`);
                    break;
                    default: break;
                }
            }
        }
        scripts.push(`set_property ip_repo_paths $xip_repo_paths [current_project] -quiet`);
        scripts.push(`update_ip_catalog -quiet`);

        // 导入bd设计源文件
        let load_bd_type = opeParam.prjInfo.SOC_MODE.bd_file;
        let bd_lib_info  = this.get_bd_info(opeParam, load_bd_type);
        if (bd_lib_info.path) {
            fs.files.copyFile(
                bd_lib_info.path, 
                `${hardwarePath}/bd/${load_bd_type}/${load_bd_type}.bd`
            );
        }

        let bd_file_list = [];
        fs.files.pickAllFile(`${hardwarePath}/bd`, [".bd"], bd_file_list);
        fs.files.pickAllFile(`${prjFilePath}/${this.prjName}.src/sources_1/bd`, [".bd"], bd_file_list);
        for (let index = 0; index < bd_file_list.length; index++) {
            const bd_file = bd_file_list[index];
            scripts.push(`add_files ${bd_file} -quiet`);
            scripts.push(`add_files ${path.dirname(bd_file)}/hdl -quiet`);
        }

        if (load_bd_type) {
            let load_bd_path = `${hardwarePath}/bd/${load_bd_type}/${load_bd_type}.bd`
            scripts.push(`generate_target all [get_files ${load_bd_path}] -quiet`);
            scripts.push(`make_wrapper -files [get_files ${load_bd_path}] -top -quiet`);
            scripts.push(`open_bd_design ${load_bd_path} -quiet`);
        }

        let mref_path = `${hardwarePath}/bd/mref`;
        if (fs.files.isExist(mref_path)) {
            let bd_files = fs.readdirSync(mref_path);
            for (let index = 0; index < bd_files.length; index++) {
                const element = bd_files[index];
                tcl_files = fs.files.pickAllFile(`${mref_path}/${element}/xgui`);
                scripts.push(`source ${tcl_files[0]}`);
            }
        }

        // 导入ip设计源文件
        let ip_file_list = [];
        fs.files.pickAllFile(`${hardwarePath}/ip`, [".xci"], ip_file_list);
        fs.files.pickAllFile(`${prjFilePath}/${this.prjName}.src/sources_1/ip`, [".xci"], ip_file_list);
        for (let index = 0; index < ip_file_list.length; index++) {
            const ip_file = ip_file_list[index];
            scripts.push(`add_files ${ip_file} -quiet`);
        }

        // 导入非本地的设计源文件
        let libFileList = this.process.oldLibFileList
        for (let index = 0; index < libFileList.length; index++) {
            const element = libFileList[index];
            scripts.push(`add_files ${element} -quiet`);
        }

        // 导入本地设计源文件
        scripts.push(`add_files ${prjStructure.HardwareSrc} -quiet`);

        // 导入本地仿真源文件
        scripts.push(`add_files -fileset sim_1 ${prjStructure.HardwareSim} -quiet`);

        // 导入本地约束源文件
        scripts.push(`add_files -fileset constrs_1 ${prjStructure.HardwareData} -quiet`);

        if (opeParam.srcTopModule.name != '') {
            scripts.push(`set_property top ${opeParam.srcTopModule.name} [current_fileset]`);
        }

        if (opeParam.simTopModule.name != '') {
            scripts.push(`set_property top ${opeParam.simTopModule.name} [get_filesets sim_1]`);
        }

        let script = '';
        for (let i = 0; i < scripts.length; i++) {
            const content = scripts[i];
            script += content + '\n';
        }
        let scriptPath = `${this.process.opeParam.rootPath}/resources/script/xilinx/refresh.tcl`;
        script += `file delete ${scriptPath} -force\n`;
        fs.files.writeFile(scriptPath, script);
        return scriptPath;
    }

    simulate() {
        let scriptPath = `${this.process.opeParam.rootPath}/resources/script/xilinx/simulate.tcl`;
        let script = `
        if {[current_sim] != ""} {
            relaunch_sim -quiet
        } else {
            launch_simulation -quiet
        }
        
        set curr_wave [current_wave_config]
        if { [string length $curr_wave] == 0 } {
            if { [llength [get_objects]] > 0} {
                add_wave /
                set_property needs_save false [current_wave_config]
            } else {
                send_msg_id Add_Wave-1 WARNING "No top level signals found. Simulator will start without a wave window. If you want to open a wave window go to 'File->New Waveform Configuration' or type 'create_wave_config' in the TCL console."
            }
        }
        run 1us
        
        start_gui -quiet
        file delete ${scriptPath} -force\n`;
        fs.files.writeFile(scriptPath, script);
        return scriptPath;
    }
    
    runSim(time) {
        let terminal = this.process.terminal;
        if (!terminal) {
            return null;
        }
        terminal.sendText(`run ${time}`);
    }

    synth() {
        let terminal = this.process.terminal;
        if (!terminal) {
            return null;
        }
        this.outputCH.clear();
        let opeParam = this.process.opeParam;
        let quietArg = '';
        if (opeParam.prjInfo.enableShowlog) {
            quietArg = '-quiet '
        }

        let script = '';
        script += `reset_run synth_1 ${quietArg};`
        script += `launch_runs synth_1 ${quietArg}-jobs 4;`
        script += `wait_on_run synth_1 ${quietArg}`

        terminal.sendText(script);
        return script;
    }

    impl() {
        let terminal = this.process.terminal;
        if (!terminal) {
            return null;
        }
        this.outputCH.clear();
        let opeParam = this.process.opeParam;
        let quietArg = '';
        if (opeParam.prjInfo.enableShowlog) {
            quietArg = '-quiet '
        }

        let script = '';
        script += `reset_run impl_1 ${quietArg};`;
        script += `launch_runs impl_1 ${quietArg}-jobs 4;`;
        script += `wait_on_run impl_1 ${quietArg};`;
        script += `open_run impl_1 ${quietArg};`;
        script += `report_timing_summary ${quietArg}`;

        terminal.sendText(script);
        return script;
    }

    build() {
        this.outputCH.clear();
        let script = '';
        let opeParam = this.process.opeParam;
        let quietArg = '';
        if (opeParam.prjInfo.enableShowlog) {
            quietArg = '-quiet'
        }
        script += `reset_run synth_1 ${quietArg}\n`
        script += `launch_runs synth_1 ${quietArg}-jobs 4\n`
        script += `wait_on_run synth_1 ${quietArg}\n`
        script += `reset_run impl_1 ${quietArg}\n`
        script += `launch_runs impl_1 ${quietArg}-jobs 4\n`
        script += `wait_on_run impl_1 ${quietArg}\n`
        script += `open_run impl_1 ${quietArg}\n`
        script += `report_timing_summary ${quietArg}\n`;
        let scriptPath = this.generateBit();
        script += `source ${scriptPath} -notrace\n`;

        scriptPath = `${this.process.opeParam.rootPath}/resources/script/xilinx/build.tcl`;
        script += `file delete ${scriptPath} -force\n`;
        fs.files.writeFile(scriptPath, script);
        return scriptPath;
    }

    generateBit() {
        let scripts = [];
        let opeParam = this.process.opeParam;
        let designMode = opeParam.prjInfo.SOC_MODE.soc;
        let softwareData = opeParam.prjStructure.SoftwareData;
        let prjFilePath = `${opeParam.prjStructure.prjPath}/xilinx`;
        let sysdefPath  = `${prjFilePath}/${this.prjName}.runs/impl_1/${this.prjName}.sysdef`;
        if (designMode && (designMode != "none")) {
            if (fs.files.isExist(sysdefPath)) {
                scripts.push(`file copy -force ${sysdefPath} ${softwareData}/[current_project].hdf`);
            } else {
                scripts.push(`write_hwdef -force -file ${softwareData}/[current_project].hdf`);
            }
            // TODO: 是否专门设置输出文件路径的参数
            scripts.push(`write_bitstream ./[current_project].bit -force -quiet`);
        } else {
            scripts.push(`write_bitstream ./[current_project].bit -force -quiet -bin_file`);
        }

        let script = '';
        for (let i = 0; i < scripts.length; i++) {
            const content = scripts[i];
            script += content + '\n';
        }
        let scriptPath = `${this.process.opeParam.rootPath}/resources/script/xilinx/bit.tcl`;
        script += `file delete ${scriptPath} -force\n`;
        fs.files.writeFile(scriptPath, script);
        return scriptPath;
    }

    program() {
        let prjInfo = this.process.opeParam.prjInfo;
        let Device = prjInfo.Device; 
        if (!Device) {
            return null;
        }
        let scriptPath = `${this.process.opeParam.rootPath}/resources/script/xilinx/program.tcl`;
        let script = `
        open_hw -quiet
        connect_hw_server -quiet
        set found 0
        foreach hw_target [get_hw_targets] {
            current_hw_target $hw_target
            open_hw_target -quiet
            foreach hw_device [get_hw_devices] {
                if { [string equal -length 6 [get_property PART $hw_device] ${Device}] == 1 } {
                    puts "------Successfully Found Hardware Target with a ${Device} device------ "
                    current_hw_device $hw_device
                    set found 1
                }
            }
            if {$found == 1} {break}
            close_hw_target
        }   
        
        #download the hw_targets
        if {$found == 0 } {
            puts "******ERROR : Did not find any Hardware Target with a ${Device} device****** "
        } else {
            set_property PROGRAM.FILE ./[current_project].bit [current_hw_device]
            program_hw_devices [current_hw_device] -quiet
            disconnect_hw_server -quiet
        }
        file delete ${scriptPath} -force\n`;

        fs.files.writeFile(scriptPath, script);
        return scriptPath;
    }

    gui(mode, installPath, filePath) {
        if (mode == "direct") {
            let command = `${installPath} -mode gui -s ${filePath} -notrace -nolog -nojournal`
            child.exec(command, (error, stdout, stderr) => {
                if (error !== null) {
                    vscode.window.showErrorMessage(stderr);
                } else {
                    vscode.window.showInformationMessage("GUI open successfully")
                }
            });
        } 
        else if (mode == "terminal") {
            let terminal = this.process.terminal;
            if (!terminal) {
                return null;
            }
            terminal.sendText("start_gui -quiet");
        }
    }

    async boot() {
        // 声明变量
        let opeParam = this.process.opeParam;
        let BootInfo = {
            "outsidePath" : `${path.dirname(opeParam.prjStructure.prjPath)}/boot`,
            "insidePath"  : `${opeParam.rootPath}/resources/boot/xilinx`,
            "outputPath"  : `${opeParam.rootPath}/resources/boot/xilinx/output.bif`,
            "elf_path"    : '',
            "bit_path"    : '',
            "fsbl_path"   : ''
        };

        if (opeParam.prjInfo.INSIDE_BOOT_TYPE) {
            BootInfo.insidePath = `${BootInfo.insidePath}/${opeParam.prjInfo.INSIDE_BOOT_TYPE}`;
        } else {
            BootInfo.insidePath = `${BootInfo.insidePath}/microphase`;
        }
    
        let output_context =  "//arch = zynq; split = false; format = BIN\n";
            output_context += "the_ROM_image:\n";
            output_context += "{\n";
    
        BootInfo.fsbl_path = await this.getfsblPath(BootInfo.outsidePath, BootInfo.insidePath);
        if (!BootInfo.fsbl_path) {
            return null;
        }
        output_context += BootInfo.fsbl_path;

        BootInfo.bit_path  = await this.getBitPath(opeParam.workspacePath);
        if (BootInfo.bit_path) {
            output_context += BootInfo.bit_path;
        }

        BootInfo.elf_path  = await this.getElfPath(BootInfo);
        if (!BootInfo.elf_path) {
            return null;
        }
        output_context += BootInfo.elf_path;

        output_context += "}";
        let result = fs.files.writeFile(BootInfo.outputPath, output_context);
        if (!result) {
            return null;
        }

        let command = `bootgen -arch zynq -image ${BootInfo.outputPath} -o ${opeParam.workspacePath}/BOOT.bin -w on`;
        child.exec(command, function (error, stdout, stderr) {
            if (error) {
                vscode.window.showErrorMessage(`${error}`);
                vscode.window.showErrorMessage(`stderr: ${stderr}`);
                return;
            } else {
                vscode.window.showInformationMessage("write boot file successfully!!")
            }
        });
    }

    async getfsblPath(outsidePath, insidePath) {
        let paths = fs.files.filter(outsidePath, (element) => {
            if(fs.paths.extname(element) != ".elf"){
                return null;
            }

            if (element.includes("fsbl.elf")) {
                return element;
            }

            return null;
        });

        if (paths.length) {
            if (paths.length == 1) {
                return `\t[bootloader]${outsidePath}/${paths[0]}\n`;
            }

            let selection = await vscode.window.showQuickPick(paths);
            if (!selection) {
                return false;
            }
            return `\t[bootloader]${outsidePath}/${selection}\n`;
        }
        
        return `\t[bootloader]${insidePath}/fsbl.elf\n`;
    }

    async getBitPath(bit_path) {
        let bitList = fs.files.pickFile(bit_path,".bit");
        if (bitList.length == 0) {
            vscode.window.showInformationMessage("Generated only from elf file");
        } 
        else if (bitList.length == 1) {
            return"\t" + bit_path + bitList[0] + "\n";
        }
        else {
            let selection = await vscode.window.showQuickPick(bitList);
            if (!selection) {
                return false;
            }
            return "\t" + bit_path + selection + "\n";
        }
    }

    async getElfPath(BootInfo) {
        // 优先在外层寻找elf文件
        let elfs = this.pickElfFile(BootInfo.outsidePath);

        if (elfs.length) {
            if (elfs.length == 1) {
                return `\t${BootInfo.outsidePath}/${elfs[0]}\n`;
            }

            let selection = await vscode.window.showQuickPick(elfs);
            if (!selection) {
                return false;
            }
            return `\t${BootInfo.outsidePath}/${selection}\n`;
        }

        // 如果外层找不到文件则从内部调用
        elfs = this.pickElfFile(BootInfo.insidePath);
        if (elfs.length) {
            if (elfs.length == 1) {
                return `\t${BootInfo.insidePath}/${elfs[0]}\n`;
            }

            let selection = await vscode.window.showQuickPick(elfs);
            if (!selection) {
                return false;
            }
            return `\t${BootInfo.insidePath}/${selection}\n`;
        }

        // 如果内层也没有则直接退出
        vscode.window.showErrorMessage("The elf file was not found\n");
        return false;
    }
    
    pickElfFile(path) {
        return fs.files.filter(path, (element) => {
            if(fs.paths.extname(element) != ".elf"){
                return null;
            }

            if (!element.includes("fsbl.elf")) {
                return element;
            }

            return null;
        });
    }

    clean() {
        let opeParam = this.process.opeParam;
        this.move_bd_ip();
        fs.dirs.rmdir(opeParam.prjStructure.prjPath); 
        fs.dirs.rmdir(`${opeParam.workspacePath}/.Xil`); 
        
        let strFile = fs.files.pickFile(opeParam.workspacePath,".str");
        strFile.forEach(element => {
            fs.files.removeFile(`${opeParam.workspacePath}/${element}`);
        });

        let logFile = fs.files.pickFile(opeParam.workspacePath,".log");
        logFile.forEach(element => {
            fs.files.removeFile(`${opeParam.workspacePath}/${element}`);
        });
    }

    move_bd_ip() {
        let opeParam = this.process.opeParam;
        let prjName = opeParam.prjInfo.PRJ_NAME.FPGA;
        let target_path = path.dirname(opeParam.prjStructure.HardwareSrc);
        let source_ip_path = `${opeParam.workspacePath}/prj/xilinx/${prjName}.srcs/sources_1/ip`;
        let source_bd_path = `${opeParam.workspacePath}/prj/xilinx/${prjName}.srcs/sources_1/bd`;

        fs.dirs.mvdir(source_ip_path, target_path);
        fs.dirs.mvdir(source_bd_path, target_path);
    }

    xExecShowLog(logPath) {
        let logPathList = ["runme", "xvlog", "elaborate"];
        let fileName = path.basename(logPath, ".log");

        if (!logPathList.includes(fileName)) {
            return null;
        }

        let content = fs.files.readFile(logPath);
        if (!content) {
            return null;
        }

        if (content.indexOf("INFO: [Common 17-206] Exiting Vivado") == -1) {
            return null;
        }

        let log = '';
        var regExp = /(?<head>CRITICAL WARNING:|ERROR:)(?<content>[\w\W]*?)(INFO:|WARNING:)/g;

        while (true) {
            let match = regExp.exec(content);
            if (match == null) {
                break;      
            }

            log += match.groups.head.replace("ERROR:", "[error] :");
            log += match.groups.content;
        }
        
        if (log != '') {
            this.outputCH.show(true);
            this.outputCH.appendLine(log);
        }
    }

    Add_bd(uri) {
        let opeParam = this.process.opeParam;
        let docPath = uri.fsPath.replace(/\\/g, "\/").replace("//", "/");
        let propertySchemaPath =`${opeParam.rootPath}/property-schema.json`;
        let propertySchema = fs.files.pullJsonInfo(propertySchemaPath);
        let bd_list_schema = propertySchema.properties.SOC_MODE.properties.bd_file.enum;

        let bd_list = [];

        let extension_bd_folder = this.setting().get('PRJ.xilinx.BD.repo.path');
        fs.files.pickAllFile(extension_bd_folder, ['.bd'], bd_list);
        let customer_bd_folder = `${opeParam.rootPath}/lib/xilinx_lib/bd`;
        fs.files.pickAllFile(customer_bd_folder, ['.bd'], bd_list);
        for (let index = 0; index < bd_list.length; index++) {
            bd_list[index] = path.basename(bd_list[index], '.bd');
        }

        let bd_name = path.basename(docPath, ".bd"); 
        if (bd_list.includes(bd_name)) {
            vscode.window.showInformationMessage(`The file already exists.`);
            return null;
        }
        let bd_folder = this.setting().get('PRJ.xilinx.BD.repo.path');
        if (!fs.files.isExist(bd_folder)) {
            vscode.window.showInformationMessage(`
            This bd file will be added into extension folder. 
            We don't recommend doing this because it will be cleared in the next update.`);
            bd_folder = `${opeParam.rootPath}/lib/xilinx_lib/bd`;
        }
        let bd_content = fs.readFileSync(docPath, "utf-8");
        let bd_path = `${bd_folder}/${bd_name}`;
        fs.writeFileSync(bd_path, bd_content, "utf-8");

        let index = bd_list_schema.indexOf(bd_name)
        if(index == -1) {
            bd_list_schema.push(bd_name);
            fs.files.pushJsonInfo(propertySchemaPath, propertySchema);
        }
    }

    Delete_bd() {
        let opeParam = this.process.opeParam;
        let propertySchemaPath =`${opeParam.rootPath}/property-schema.json`;
        let propertySchema = fs.files.pullJsonInfo(propertySchemaPath);
        let bd_list_schema = propertySchema.properties.SOC_MODE.properties.bd_file.enum;

        let extension_bd_list = [];
        let customer_bd_list = [];

        let extension_bd_folder = this.setting().get('PRJ.xilinx.BD.repo.path');
        fs.files.pickAllFile(extension_bd_folder, ['.bd'], extension_bd_list);
        for (let index = 0; index < extension_bd_list.length; index++) {
            extension_bd_list[index] = path.basename(extension_bd_list[index], '.bd');
        }
        let customer_bd_folder = `${opeParam.rootPath}/lib/xilinx_lib/bd`;
        fs.files.pickAllFile(customer_bd_folder, ['.bd'], customer_bd_list);
        for (let index = 0; index < customer_bd_list.length; index++) {
            customer_bd_list[index] = path.basename(customer_bd_list[index], '.bd');
        }

        let bd_list = extension_bd_list.concat(customer_bd_list);
        vscode.window.showQuickPick(bd_list).then(selection => {
            // the user canceled the selection
            if (!selection) {
                return;
            }
            // the user selected some item. You could use `selection.name` too
            if (extension_bd_list.includes(selection)) {
                let bd_path = `${extension_bd_folder}/${selection}.bd`;
                fs.files.removeFile(bd_path);
            } 
            else if (customer_bd_list.includes(selection)) {
                let bd_path = `${customer_bd_folder}/${selection}.bd`;
                fs.files.removeFile(bd_path);
            }
            let index = bd_list_schema.indexOf(selection)
            if(index != -1) {
                bd_list_schema.splice(index, 1);
                fs.files.pushJsonInfo(propertySchemaPath, propertySchema);
            }
        });
    }

    Overwrite_bd(uri) {
        let opeParam = this.process.opeParam;
        let docPath = uri.fsPath.replace(/\\/g, "\/").replace("//", "/");
        
        let bd_name = path.basename(docPath, ".bd");
        let bd_info = this.get_bd_info(opeParam, bd_name);
        let bd_content = fs.readFileSync(docPath, "utf-8");

        if (bd_info.path) {
            fs.writeFileSync(bd_info.path, bd_content, "utf-8");
        } else {
            let bd_list = [];
            for (let index = 0; index < bd_info.extension.length; index++) {
                bd_list.push(path.basename(bd_info.extension[index]));
            }
            for (let index = 0; index < bd_info.customer.length; index++) {
                bd_list.push(path.basename(bd_info.customer[index]));
            }
            vscode.window.showQuickPick(bd_list).then(selection => {
                // the user canceled the selection
                if (!selection) {
                    return;
                }
                // the user selected some item. You could use `selection.name` too

                for (let index = 0; index < bd_info.extension.length; index++) {
                    const element = path.basename(bd_info.extension[index]);
                    if (element == selection) {
                        let bd_path = bd_info.extension[index];
                        fs.writeFileSync(bd_path, bd_content, "utf-8");
                        return;
                    }
                }
        
                for (let index = 0; index < bd_info.customer.length; index++) {
                    const element = path.basename(bd_info.customer[index]);
                    if (element == selection) {
                        let bd_path = bd_info.customer[index];
                        fs.writeFileSync(bd_path, bd_content, "utf-8");
                        return;
                    }
                }
            });
        }
    }

    get_bd_info(opeParam, name) {
        let extension_bd_list = [];
        let customer_bd_list = [];

        let extension_bd_folder = this.setting().get('PRJ.xilinx.BD.repo.path');
        fs.files.pickAllFile(extension_bd_folder, ['.bd'], extension_bd_list);
        let customer_bd_folder = `${opeParam.rootPath}/lib/xilinx_lib/bd`;
        fs.files.pickAllFile(customer_bd_folder, ['.bd'], customer_bd_list);

        let info = {
            "path" : null,
            "customer"  : customer_bd_list,
            "extension" : extension_bd_list
        }
        
        for (let index = 0; index < extension_bd_list.length; index++) {
            const element = path.basename(extension_bd_list[index], '.bd');
            if (element == name) {
                info.path = extension_bd_list[index];
                return info;
            }
        }

        for (let index = 0; index < customer_bd_list.length; index++) {
            const element = path.basename(customer_bd_list[index], '.bd');
            if (element == name) {
                info.path = customer_bd_list[index];
                return info;
            }
        }

        return info;
    }

    addDevice(opeParam) {
        let propertyParam = files.pullJsonInfo(`${opeParam.rootPath}/property.json`);
        vscode.window.showInputBox({
            password: false,
            ignoreFocusOut: true,
            placeHolder: 'Please input the name of device',
        }).then((Device) => {
            if (propertyParam.properties.Device.enum.indexOf(Device) == -1) {
                propertyParam.properties.Device.enum.push(Device);
                files.pushJsonInfo(`${opeParam.rootPath}/property.json`, propertyParam);
                vscode.window.showInformationMessage(`Add the ${Device} successfully!!!`)
            }
            else {
                vscode.window.showWarningMessage("The device already exists")
            }
        });
    }

    delDevice(opeParam) {
        let propertyParam = files.pullJsonInfo(`${opeParam.rootPath}/property.json`);
        vscode.window.showQuickPick(propertyParam.properties.Device.enum).then(Device => {
            if (!Device) {
                return;
            }
            for (var index = 0; index < propertyParam.properties.Device.enum.length; index++) {
                if (Device == propertyParam.properties.Device.enum[index]) {
                    propertyParam.properties.Device.enum.splice(index, 1);
                }
            }
            files.pushJsonInfo(`${opeParam.rootPath}/property.json`, propertyParam);
            vscode.window.showInformationMessage(`Delete the ${Device} successfully!!!`)
        });
    }
}
module.exports = xilinxOperation;




variable current_Location [file normalize [info script]]
set intel_path [file dirname [file dirname [file dirname [file dirname $current_Location]]]]

set device_num      0
set add_param       1

set device_num      0
set fp [open $device_file r]
while { [gets $fp data] >= 0 } {
	set device_num [expr $device_num + $add_param]
	set device_arr($device_num) $data
}
close $fp

#creat project

set_property SOURCE_SET sources_1 [get_filesets sim_1]
set_property top_lib xil_defaultlib [get_filesets sim_1]
update_compile_order -fileset sim_1 -quiet

#source ./.TOOL/xilinx/zynq_ps.tcl -notrace;
source [file dirname $current_Location]/Run.tcl -notrace;
IMU 运动过滤训练原型

本模块使用 PAMAP2 wrist/hand IMU 数据训练标准化逻辑回归，识别运动干扰。
串行部署方案中，仅当 IMU 运动门控允许时，才进入 EDA 生理确认。

数据与模型：
100 Hz 六轴输入，2 秒窗口、1 秒步长。
S101–S106 训练全局模型，S107–S108 进行个人校准、反馈与留出评估。
基线从低活动窗口中选取；后续窗口按类别随机分成 50% 反馈、50% 留出评估。
个人阶段允许选择基线对齐强度和阈值，全局分类器权重保持冻结。

评估限制：
本脚本先滑窗后随机分组，相邻窗口可能共享原始采样点，不能称为严格时间隔离盲测。
后续正式验证应先按连续时间块划分，再在各块内生成窗口，并在边界保留隔离带。

运行：
python train_pamap2_motion_filter.py

输出：
output/metrics.json              原型评估与逐人指标
output/imu_motion_gate.pkl       模型附件
output/imu_motion_gate_params.h  C 参数附件

当前仅展示 docs/ALGORITHM_METRICS.md 中的两组 IMU / EDA 指标。
真实手表效果需经过采样率、佩戴方向、单位与传感器质量验证。

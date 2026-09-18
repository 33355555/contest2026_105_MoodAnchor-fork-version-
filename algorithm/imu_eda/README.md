# IMU + EDA 算法材料

当前对外说明统一采用“IMU 运动过滤 → EDA 生理确认”的串行门控方案，不包含原始公开数据集。

- `training/train_pamap2_motion_filter.py`：IMU 个体化原型训练与窗口留出评估。
- `training/eda_only_strict/run_eda_only_strict.py`：EDA 独立训练与会话内时间盲测。
- `embedded/mood_gate/`：端侧 C99 串行门控核心与参数，待完成黄山派传感器接入。
- `model/`：IMU 原型模型附件。
- `results/imu_motion_filter_metrics.json` 与 `results/strict_protocol/eda_only_results.json`：当前展示的两组指标来源。
- `docs/`：IMU + EDA 训练、校准与部署边界说明。

统一指标表、评估方式与限制见 [算法训练流程、数据集与指标](../../docs/ALGORITHM_METRICS.md)。目录中其他研究附件不作为当前产品功能或展示指标的依据。

黄山派默认使用原型规则阈值事件链路。串行模型需完成采样率、窗口、特征顺序、输入单位和传感器质量验证后，才可接入默认应用。

App 模拟入口的 `0.74` 是固定演示分数，用于演示记录、通知和交互，不代表实测概率。实际模型概率需由手表完成算法部署、输入校准及验证后计算并上报；模型概率本身也不等于识别准确率。

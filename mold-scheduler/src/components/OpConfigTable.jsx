import { useState } from "react";
import {
  Table, Input, InputNumber, Select, Checkbox, Card, Collapse, Button,
  Space, Typography, Tag,
} from "antd";
import { ApartmentOutlined, TableOutlined } from "@ant-design/icons";
import { normalizeWorkersFields } from "../scheduler/workersRange.js";

const { Text, Paragraph } = Typography;

export default function OpConfigTable({
  ops, roomList, roomMatrixText, onOpsChange, onMatrixTextChange, onApplyMatrix,
}) {
  const [matrixOpen, setMatrixOpen] = useState(false);

  const updOp = (id, patch) => {
    onOpsChange(ops.map(o => (o.id === id ? { ...o, ...patch } : o)));
  };

  const updWorkers = (id, patch) => {
    const row = ops.find(o => o.id === id);
    if (!row) return;
    const merged = normalizeWorkersFields({ ...row, ...patch });
    updOp(id, {
      ...patch,
      workersMin: merged.workersMin,
      workersMax: merged.workersMax,
      workers: merged.workersMax,
    });
  };

  const depOptions = ops.map(o => ({ label: `${o.id} ${o.name}`, value: o.id }));
  const roomOptions = roomList.map(r => ({ label: `房间 ${r}`, value: r }));

  const columns = [
    {
      title: "工步 ID",
      dataIndex: "id",
      width: 72,
      fixed: "left",
      render: id => <Text strong style={{ fontFamily: "monospace" }}>{id}</Text>,
    },
    {
      title: "合并工序",
      dataIndex: "name",
      width: 120,
      render: (name, row) => (
        <Input
          size="small"
          value={name}
          onChange={e => updOp(row.id, { name: e.target.value })}
        />
      ),
    },
    {
      title: "原小工序",
      dataIndex: "subOps",
      width: 200,
      ellipsis: true,
      render: t => <Text type="secondary" style={{ fontSize: 12 }}>{t}</Text>,
    },
    {
      title: "前置依赖",
      dataIndex: "deps",
      width: 220,
      render: (deps, row) => (
        <Select
          mode="multiple"
          size="small"
          style={{ width: "100%" }}
          placeholder="选择前置工步"
          value={deps || []}
          options={depOptions.filter(o => o.value !== row.id)}
          onChange={v => updOp(row.id, { deps: v })}
          maxTagCount={2}
        />
      ),
    },
    {
      title: "可执行房间",
      dataIndex: "rooms",
      width: 240,
      render: (rooms, row) => (
        <Checkbox.Group
          options={roomOptions}
          value={rooms || []}
          onChange={v => updOp(row.id, { rooms: v.sort((a, b) => a - b) })}
        />
      ),
    },
    {
      title: "工时(h)",
      dataIndex: "dur",
      width: 88,
      render: (dur, row) => (
        <InputNumber
          size="small"
          min={0.1}
          step={0.5}
          value={dur}
          onChange={v => updOp(row.id, { dur: v ?? 0.1 })}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "要求等级",
      dataIndex: "requiredLevel",
      width: 88,
      render: (lv, row) => (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={lv ?? 3}
          options={[2, 3, 4, 5].map(v => ({ label: `L${v}`, value: v }))}
          onChange={v => updOp(row.id, { requiredLevel: v })}
        />
      ),
    },
    {
      title: "人数下限",
      dataIndex: "workersMin",
      width: 80,
      render: (_, row) => {
        const { workersMin } = normalizeWorkersFields(row);
        return (
          <InputNumber
            size="small"
            min={1}
            max={20}
            value={workersMin}
            onChange={v => updWorkers(row.id, { workersMin: v ?? 1 })}
            style={{ width: "100%" }}
          />
        );
      },
    },
    {
      title: "人数上限",
      dataIndex: "workersMax",
      width: 80,
      render: (_, row) => {
        const { workersMax } = normalizeWorkersFields(row);
        return (
          <InputNumber
            size="small"
            min={1}
            max={20}
            value={workersMax}
            onChange={v => updWorkers(row.id, { workersMax: v ?? 1 })}
            style={{ width: "100%" }}
          />
        );
      },
    },
    {
      title: "分组",
      dataIndex: "group",
      width: 100,
      render: (group, row) => (
        <Input
          size="small"
          value={group || ""}
          onChange={e => updOp(row.id, { group: e.target.value })}
        />
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        size="small"
        title={
          <Space>
            <ApartmentOutlined />
            <span>工步工艺配置</span>
            <Tag>{ops.length} 道工序</Tag>
          </Space>
        }
        extra={
          <Button
            size="small"
            icon={<TableOutlined />}
            onClick={() => setMatrixOpen(v => !v)}
          >
            {matrixOpen ? "收起房间矩阵" : "编辑房间矩阵"}
          </Button>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
          配置 DAG 前置依赖与房间可执行资格。人数区间：排产按上限占产能，派工在 min~max 间按空闲人员分配；固定人数时 min=max。
        </Paragraph>

        {matrixOpen && (
          <Collapse
            activeKey={["matrix"]}
            items={[{
              key: "matrix",
              label: "工步 × 房间 0/1 矩阵（文本导入）",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    每行格式：工步ID + 各房间 0/1，空格分隔。示例：M1 1 0 0 0 0 0 0 0
                  </Text>
                  <Input.TextArea
                    rows={8}
                    value={roomMatrixText}
                    onChange={e => onMatrixTextChange(e.target.value)}
                    style={{ fontFamily: "monospace", fontSize: 12 }}
                  />
                  <Button type="primary" size="small" onClick={onApplyMatrix}>
                    应用矩阵
                  </Button>
                </Space>
              ),
            }]}
            style={{ marginBottom: 16 }}
          />
        )}

        <Table
          rowKey="id"
          size="small"
          bordered
          pagination={false}
          scroll={{ x: 1400 }}
          dataSource={ops}
          columns={columns}
        />
      </Card>
    </Space>
  );
}

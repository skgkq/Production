import { Table, Input, Select, Button, Card } from "antd";
import { TeamOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";

const LEVEL_OPTIONS = [2, 3, 4, 5].map(v => ({ label: `L${v}`, value: v }));

export default function StaffListPanel({ staffList, onChange }) {
  const list = staffList || [];

  const upd = (idx, patch) => {
    onChange(list.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const add = () => {
    onChange([...list, { name: `新人${list.length + 1}`, level: 3 }]);
  };

  const remove = idx => {
    if (list.length <= 1) return;
    onChange(list.filter((_, i) => i !== idx));
  };

  const columns = [
    {
      title: "姓名",
      dataIndex: "name",
      render: (name, _, idx) => (
        <Input
          size="small"
          value={name}
          onChange={e => upd(idx, { name: e.target.value })}
        />
      ),
    },
    {
      title: "等级",
      dataIndex: "level",
      width: 100,
      render: (level, _, idx) => (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={level}
          options={LEVEL_OPTIONS}
          onChange={v => upd(idx, { level: v })}
        />
      ),
    },
    {
      title: "",
      width: 48,
      render: (_, __, idx) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          disabled={list.length <= 1}
          onClick={() => remove(idx)}
        />
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={<><TeamOutlined /> 生产人员（等级派工）</>}
      extra={
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={add}>
          添加
        </Button>
      }
    >
      <Table
        rowKey={(_, i) => i}
        size="small"
        bordered
        pagination={false}
        dataSource={list}
        columns={columns}
      />
    </Card>
  );
}

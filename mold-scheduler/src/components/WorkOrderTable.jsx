import { Table, Tag, Typography } from "antd";
import { formatTime } from "./GanttByRoom.jsx";

const { Text } = Typography;

export default function WorkOrderTable({ events, collapseGroup }) {
  if (!events.length) return null;

  let dataSource = events;
  if (collapseGroup) {
    const map = {};
    for (const e of events) {
      const g = e.opGroup || "未分组";
      if (!map[g]) {
        map[g] = {
          key: g,
          opName: g,
          opGroup: g,
          opId: "—",
          count: 0,
          start: e.start,
          end: e.end,
          rooms: new Set(),
          wo: "—",
          batchLabel: "—",
          workers: "—",
        };
      }
      map[g].count++;
      map[g].start = Math.min(map[g].start, e.start);
      map[g].end = Math.max(map[g].end, e.end);
      map[g].rooms.add(e.room);
    }
    dataSource = Object.values(map).map(g => ({
      ...g,
      dur: g.end - g.start,
      room: [...g.rooms].sort((a, b) => a - b),
      opName: `${g.opGroup}（${g.count} 道）`,
    }));
  }

  const columns = [
    { title: "工单号", dataIndex: "wo", width: 88, render: t => <Text code>{t}</Text> },
    { title: "批次", dataIndex: "batchLabel", width: 72 },
    {
      title: "工步 ID",
      dataIndex: "opId",
      width: 72,
      render: id => id !== "—" ? <Tag color="blue">{id}</Tag> : "—",
    },
    { title: "工序", dataIndex: "opName", ellipsis: true },
    { title: "分组", dataIndex: "opGroup", width: 100, render: g => g || "—" },
    {
      title: "房间",
      dataIndex: "room",
      width: 120,
      render: room => {
        const list = Array.isArray(room) ? room : [room];
        return list.map(r => <Tag key={r} color="geekblue">R{r}</Tag>);
      },
    },
    {
      title: "计划开始",
      dataIndex: "start",
      width: 130,
      render: t => <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{formatTime(t)}</Text>,
    },
    {
      title: "计划完成",
      dataIndex: "end",
      width: 130,
      render: t => <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{formatTime(t)}</Text>,
    },
    {
      title: "工时(h)",
      dataIndex: "dur",
      width: 80,
      align: "right",
      render: d => (typeof d === "number" ? d.toFixed(1) : d),
    },
    { title: "人员", dataIndex: "workers", width: 56, align: "center" },
  ];

  return (
    <Table
      rowKey={(r, i) => r.opId + r.start + i}
      size="small"
      bordered
      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      dataSource={dataSource}
      columns={columns}
      scroll={{ x: 1100 }}
    />
  );
}

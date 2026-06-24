import { Table, Tag, Typography, Tooltip, Space } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { formatTime } from "./GanttByRoom.jsx";
import { workersRangeLabel } from "../scheduler/workersRange.js";

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
          assignStatus: "OK",
        };
      }
      map[g].count++;
      map[g].start = Math.min(map[g].start, e.start);
      map[g].end = Math.max(map[g].end, e.end);
      map[g].rooms.add(e.room);
      if (e.assignStatus === "SHORTAGE") map[g].assignStatus = "SHORTAGE";
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
    {
      title: "要求等级",
      dataIndex: "requiredLevel",
      width: 80,
      render: lv => (lv != null ? <Tag>L{lv}</Tag> : "—"),
    },
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
      title: "需求人数",
      width: 88,
      render: (_, row) => {
        if (row.opId === "—") return "—";
        const label = workersRangeLabel(row);
        return <Text>{label === "—" ? "—" : `${label}人`}</Text>;
      },
    },
    {
      title: "工时(h)",
      dataIndex: "dur",
      width: 80,
      align: "right",
      render: d => (typeof d === "number" ? d.toFixed(1) : d),
    },
    {
      title: "派工人员",
      dataIndex: "assignedStaff",
      width: 160,
      render: (staff, row) => {
        if (row.assignStatus === "SHORTAGE") {
          const msg = row.assignErrors?.join("；") || "人员不足";
          return (
            <Tooltip title={msg}>
              <Tag icon={<WarningOutlined />} color="error">派工不足</Tag>
            </Tooltip>
          );
        }
        if (Array.isArray(staff) && staff.length) {
          return (
            <Space size={4} wrap>
              {staff.map(n => <Tag key={n} color="blue">{n}</Tag>)}
              <Text type="secondary" style={{ fontSize: 12 }}>（{staff.length}人）</Text>
            </Space>
          );
        }
        return row.workers ?? "—";
      },
    },
  ];

  return (
    <Table
      rowKey={(r, i) => r.opId + r.start + i}
      size="small"
      bordered
      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
      dataSource={dataSource}
      columns={columns}
      scroll={{ x: 1200 }}
      rowClassName={r => (r.assignStatus === "SHORTAGE" ? "assign-shortage-row" : "")}
      onRow={r => ({
        style: r.assignStatus === "SHORTAGE" ? { background: "#fff2f0" } : undefined,
      })}
    />
  );
}

import { Table, Tag, Typography, Row, Col, Statistic, Card } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { formatTime } from "./GanttByRoom.jsx";

const { Text } = Typography;

export default function StaffScheduleTable({ staffRows, staffSummary }) {
  if (!staffRows?.length && !Object.keys(staffSummary || {}).length) return null;

  const summaryEntries = Object.entries(staffSummary || {});

  const columns = [
    {
      title: "姓名",
      dataIndex: "staffName",
      width: 88,
      fixed: "left",
      render: (name, row) => (
        <Tag icon={<UserOutlined />} color="blue">
          {name}
          {row.staffLevel != null && <span style={{ marginLeft: 4, opacity: 0.85 }}>L{row.staffLevel}</span>}
        </Tag>
      ),
    },
    { title: "工单号", dataIndex: "wo", width: 88, render: t => <Text code>{t}</Text> },
    { title: "批次", dataIndex: "batchLabel", width: 72 },
    {
      title: "工步",
      dataIndex: "opId",
      width: 72,
      render: id => <Tag>{id}</Tag>,
    },
    { title: "工序", dataIndex: "opName", ellipsis: true },
    {
      title: "工步要求",
      dataIndex: "requiredLevel",
      width: 80,
      render: lv => <Tag color="purple">L{lv}</Tag>,
    },
    {
      title: "房间",
      dataIndex: "room",
      width: 80,
      render: r => <Tag color="geekblue">R{r}</Tag>,
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
      render: d => d?.toFixed?.(1),
    },
  ];

  return (
    <div>
      {summaryEntries.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: "12px 16px" }}>
          <Row gutter={[16, 12]}>
            {summaryEntries.map(([name, s]) => (
              <Col xs={12} sm={8} md={6} lg={4} key={name}>
                <Statistic
                  title={<>{name} <Tag style={{ marginLeft: 4 }}>L{s.level}</Tag></>}
                  value={s.totalHours.toFixed(1)}
                  suffix="h"
                  prefix={<UserOutlined />}
                  valueStyle={{ fontSize: 18 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>{s.taskCount} 项任务</Text>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {staffRows?.length > 0 ? (
        <Table
          rowKey="key"
          size="small"
          bordered
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条派工记录` }}
          dataSource={staffRows}
          columns={columns}
          scroll={{ x: 1100 }}
        />
      ) : (
        <Text type="secondary">暂无成功派工记录（可能存在派工不足的工步）</Text>
      )}
    </div>
  );
}

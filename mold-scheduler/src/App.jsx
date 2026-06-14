import { useState, useMemo } from "react";
import {
  Layout, Menu, Button, Alert, Card, Form, InputNumber, Tag, Space,
  Statistic, Row, Col, Segmented, Switch, Empty, Typography, Divider,
} from "antd";
import {
  ApartmentOutlined, SettingOutlined, ScheduleOutlined, BarChartOutlined,
  PlayCircleOutlined, HomeOutlined, TableOutlined, FundProjectionScreenOutlined,
} from "@ant-design/icons";
import {
  DEFAULT_OPS, DEFAULT_PLAN, DEFAULT_CST, DEFAULT_ROOM_MATRIX, DEFAULT_ROOM_LIST,
} from "./data/opsSeed.js";
import { runSchedule, computeStats } from "./scheduler/greedy.js";
import { validateScheduleReadiness } from "./scheduler/dag.js";
import {
  parseRoomMatrix, applyMatrixToOps, matrixToText, validateRoomMatrix,
} from "./scheduler/rooms.js";
import { normalizeCst } from "./scheduler/shift.js";
import OpConfigTable from "./components/OpConfigTable.jsx";
import PlanPanel from "./components/PlanPanel.jsx";
import GanttByRoom from "./components/GanttByRoom.jsx";
import WorkOrderTable from "./components/WorkOrderTable.jsx";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const MENU_ITEMS = [
  { key: "ops", icon: <ApartmentOutlined />, label: "工步配置" },
  { key: "cst", icon: <SettingOutlined />, label: "约束参数" },
  { key: "plan", icon: <ScheduleOutlined />, label: "排产计划" },
  { key: "result", icon: <BarChartOutlined />, label: "排产结果" },
];

function cloneOps(ops) {
  return ops.map(o => ({ ...o, deps: [...(o.deps || [])], rooms: [...(o.rooms || [])] }));
}

export default function App() {
  const [tab, setTab] = useState("ops");
  const [ops, setOps] = useState(() => cloneOps(DEFAULT_OPS));
  const [plan, setPlan] = useState(() => [...DEFAULT_PLAN]);
  const [cst, setCst] = useState(() => ({ ...DEFAULT_CST }));
  const [events, setEvents] = useState([]);
  const [collapseGroup, setCollapseGroup] = useState(false);
  const [view, setView] = useState("gantt");
  const [roomMatrixText, setRoomMatrixText] = useState(() =>
    matrixToText(DEFAULT_ROOM_MATRIX, DEFAULT_OPS.map(o => o.id), DEFAULT_ROOM_LIST)
  );
  const [error, setError] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const normCst = useMemo(() => normalizeCst(cst), [cst]);
  const stats = useMemo(() => computeStats(events, normCst), [events, normCst]);

  const applyMatrix = () => {
    const opIds = ops.map(o => o.id);
    const parsed = parseRoomMatrix(roomMatrixText, opIds, normCst.roomList);
    if (!parsed) {
      setError("矩阵格式无效，请检查每行：工步ID + 各房间 0/1");
      return;
    }
    setOps(applyMatrixToOps(ops, parsed, normCst.roomList));
    setError("");
  };

  const handleSchedule = () => {
    setScheduling(true);
    const dagErrors = validateScheduleReadiness(ops);
    const roomErrors = validateRoomMatrix(ops, normCst.roomList);
    const allErrors = [...dagErrors, ...roomErrors];
    if (allErrors.length) {
      setError(allErrors.join("\n"));
      setScheduling(false);
      return;
    }
    const { events: evts, errors } = runSchedule(plan, ops, normCst);
    if (errors.length) {
      setError(errors.join("\n"));
      setScheduling(false);
      return;
    }
    setEvents(evts);
    setError("");
    setTab("result");
    setScheduling(false);
  };

  const updCst = (k, v) => {
    setCst(p => normalizeCst({ ...p, [k]: v }));
    setEvents([]);
  };

  const addRoom = () => {
    const max = Math.max(...normCst.roomList, 0);
    updCst("roomList", [...normCst.roomList, max + 1]);
  };

  const removeRoom = (r) => {
    if (normCst.roomList.length <= 1) return;
    updCst("roomList", normCst.roomList.filter(x => x !== r));
    setOps(prev => prev.map(o => ({ ...o, rooms: o.rooms.filter(x => x !== r) })));
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
          <FundProjectionScreenOutlined style={{ fontSize: 22, color: "#fff", marginRight: 12 }} />
          <div>
            <Title level={5} style={{ color: "#fff", margin: 0, lineHeight: 1.3 }}>
              模具工步排产系统
            </Title>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
              DAG 拓扑调度 · 房间资源约束
            </Text>
          </div>
        </div>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={scheduling}
          onClick={handleSchedule}
          style={{ background: "#1677ff" }}
        >
          生成排产
        </Button>
      </Header>

      <div style={{ background: "#fff", borderBottom: "1px solid #f0f0f0", padding: "0 24px" }}>
        <Menu
          mode="horizontal"
          selectedKeys={[tab]}
          items={MENU_ITEMS}
          onClick={({ key }) => setTab(key)}
          style={{ border: "none", minWidth: 0, flex: "auto" }}
        />
      </div>

      <Content style={{ padding: 24, maxWidth: 1440, margin: "0 auto", width: "100%" }}>
        {error && (
          <Alert
            type="error"
            showIcon
            closable
            onClose={() => setError("")}
            message="排产校验未通过"
            description={<pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{error}</pre>}
            style={{ marginBottom: 16 }}
          />
        )}

        {tab === "ops" && (
          <OpConfigTable
            ops={ops}
            roomList={normCst.roomList}
            roomMatrixText={roomMatrixText}
            onOpsChange={v => { setOps(v); setEvents([]); }}
            onMatrixTextChange={setRoomMatrixText}
            onApplyMatrix={applyMatrix}
          />
        )}

        {tab === "cst" && (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card size="small" title={<><SettingOutlined /> 班次与人员</>}>
                <Form layout="vertical" size="small">
                  <Row gutter={16}>
                    {[
                      ["shiftStart", "班次开始 (时)", 0, 23],
                      ["shiftEnd", "班次结束 (时)", 1, 24],
                      ["workDays", "排产天数", 1, 14],
                      ["totalWorkers", "可用人数", 1, 20],
                    ].map(([k, label, min, max]) => (
                      <Col span={12} key={k}>
                        <Form.Item label={label}>
                          <InputNumber
                            min={min}
                            max={max}
                            value={cst[k]}
                            onChange={v => updCst(k, v ?? min)}
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                      </Col>
                    ))}
                  </Row>
                </Form>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                size="small"
                title={<><HomeOutlined /> 生产房间</>}
                extra={
                  <Button type="link" size="small" onClick={addRoom}>
                    添加房间
                  </Button>
                }
              >
                <Space size={[8, 8]} wrap>
                  {normCst.roomList.map(r => (
                    <Tag
                      key={r}
                      closable={normCst.roomList.length > 1}
                      onClose={e => { e.preventDefault(); removeRoom(r); }}
                      color="processing"
                      style={{ padding: "4px 10px", fontSize: 13 }}
                    >
                      房间 {r}
                    </Tag>
                  ))}
                </Space>
                <Divider style={{ margin: "12px 0" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  工步仅在矩阵标记为 1 的房间可排产；同房同时仅允许一单作业。
                </Text>
              </Card>
            </Col>
          </Row>
        )}

        {tab === "plan" && (
          <PlanPanel plan={plan} onChange={v => { setPlan(v); setEvents([]); }} />
        )}

        {tab === "result" && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {stats && (
              <Card size="small" bodyStyle={{ padding: "12px 16px" }}>
                <Row gutter={[16, 16]}>
                  <Col xs={12} sm={6}>
                    <Statistic title="完工时间" value={stats.makespan.toFixed(1)} suffix="h" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="批次数" value={stats.batchCount} />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="工步记录" value={stats.opCount} suffix="条" />
                  </Col>
                  {normCst.roomList.slice(0, 3).map(r => (
                    <Col xs={12} sm={6} key={r}>
                      <Statistic
                        title={`房间 ${r} 利用率`}
                        value={(stats.roomBusy[r]?.util || 0).toFixed(0)}
                        suffix="%"
                      />
                    </Col>
                  ))}
                </Row>
              </Card>
            )}

            <Card
              size="small"
              title="排产结果"
              extra={
                <Space>
                  <Segmented
                    size="small"
                    value={view}
                    onChange={setView}
                    options={[
                      { label: "甘特图", value: "gantt", icon: <BarChartOutlined /> },
                      { label: "工单", value: "workorder", icon: <TableOutlined /> },
                    ]}
                  />
                  <Switch
                    size="small"
                    checked={collapseGroup}
                    onChange={setCollapseGroup}
                    checkedChildren="折叠"
                    unCheckedChildren="展开"
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>按分组</Text>
                </Space>
              }
            >
              {events.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无排产数据，请配置工步后点击「生成排产」"
                />
              ) : view === "gantt" ? (
                <GanttByRoom events={events} cst={normCst} collapseGroup={collapseGroup} />
              ) : (
                <WorkOrderTable events={events} collapseGroup={collapseGroup} />
              )}
            </Card>
          </Space>
        )}
      </Content>
    </Layout>
  );
}

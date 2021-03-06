
import React from 'react';
import PropTypes from 'prop-types';

import { format } from 'd3-format';
import { timeFormat } from 'd3-time-format';
import shortid from 'shortid';
import { ChartCanvas, Chart } from 'react-stockcharts';

import {
	Modal,
	Button,
	FormGroup,
	ControlLabel,
	FormControl,
} from "react-bootstrap";

import {
	BarSeries,
	AreaSeries,
	CandlestickSeries,
	OHLCSeries,
	LineSeries,
} from 'react-stockcharts/lib/series';
import { XAxis, YAxis } from 'react-stockcharts/lib/axes';
import {
	CrossHairCursor,
	CurrentCoordinate,
	MouseCoordinateX,
	MouseCoordinateY,
	EdgeIndicator,
} from 'react-stockcharts/lib/coordinates';

import { discontinuousTimeScaleProvider } from 'react-stockcharts/lib/scale';
import {
	OHLCTooltip,
	MovingAverageTooltip,
	HoverTooltip,
} from 'react-stockcharts/lib/tooltip';
import { ema, sma } from 'react-stockcharts/lib/indicator';
import { fitWidth } from 'react-stockcharts/lib/helper';
import { head, last, toObject } from 'react-stockcharts/lib/utils';
import { InteractiveText, DrawingObjectSelector, InteractiveYCoordinate } from "react-stockcharts/lib/interactive";
import { getMorePropsForChart } from "react-stockcharts/lib/interactive/utils";
import { saveInteractiveNodes, getInteractiveNodes } from '../utils/interactiveutils';
import { Colors } from '../styles/variables';

function round(number, precision = 0) {
	const d = Math.pow(10, precision);
	return Math.round(number * d) / d;
}

var defaultTextStyles = {
	...InteractiveText.defaultProps.defaultText,
	fontSize: 15,
	fontWeight: 'bold',
	bgFill: 'rgba(0,0,0,0)',
	bgStrokeWidth: 0,
	text: '',
};

var hoverTextStyles = {
	...InteractiveText.defaultProps.hoverText,
	text: 'Click here to move it',
};

const dateFormat = timeFormat("%Y-%m-%d");
const numberFormat = format(".2f");

function tooltipContent(ys) {
	return ({ currentItem, xAccessor }) => {
		return {
			x: dateFormat(xAccessor(currentItem)),
			y: [
				{
					label: "open",
					value: currentItem.open && numberFormat(currentItem.open)
				},
				{
					label: "high",
					value: currentItem.high && numberFormat(currentItem.high)
				},
				{
					label: "low",
					value: currentItem.low && numberFormat(currentItem.low)
				},
				{
					label: "close",
					value: currentItem.close && numberFormat(currentItem.close)
				}
			]
				.concat(
					ys.map(each => ({
						label: each.label,
						value: each.value(currentItem),
						stroke: each.stroke
					}))
				)
				.filter(line => line.value)
		};
	};
}

class Dialog extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			text: props.text,
		};
		this.handleChange = this.handleChange.bind(this);
		this.handleSave = this.handleSave.bind(this);
	}
	componentWillReceiveProps(nextProps) {
		this.setState({
			text: nextProps.text,
		});
	}
	handleChange(e) {
		this.setState({
			text: e.target.value
		});
	}
	handleSave() {
		this.props.onSave(this.state.text, this.props.chartId);
	}
	render() {
		const {
			showModal,
			onClose,
		} = this.props;
		const { text } = this.state;

		return (
			<Modal show={showModal} onHide={onClose} >
				<Modal.Header closeButton>
					<Modal.Title>Edit text</Modal.Title>
				</Modal.Header>

				<Modal.Body>
					<form>
						<FormGroup controlId="text">
							<ControlLabel>Text</ControlLabel>
							<FormControl type="text" value={text} onChange={this.handleChange} />
						</FormGroup>
					</form>
				</Modal.Body>

				<Modal.Footer>
					<Button bsStyle="primary" onClick={this.handleSave}>Save</Button>
				</Modal.Footer>
			</Modal>
		);
	}
}

const alert = InteractiveYCoordinate.defaultProps.defaultPriceCoordinate;

class AlertDialog extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			alert: props.alert,
		};
		this.handleChange = this.handleChange.bind(this);
		this.handleSave = this.handleSave.bind(this);
	}
	componentWillReceiveProps(nextProps) {
		this.setState({
			alert: nextProps.alert,
		});
	}
	handleChange(e) {
		const { alert } = this.state;
		this.setState({
			alert: {
				...alert,
				yValue: Number(e.target.value),
			}
		});
	}
	handleSave() {
		this.props.onSave(this.state.alert, this.props.chartId);
	}
	render() {
		const {
			showModal,
			onClose,
			onDeleteAlert,
		} = this.props;
		const { alert } = this.state;

		if (!showModal) return null;
		return (
			<Modal show={showModal} onHide={onClose} >
				<Modal.Header closeButton>
					<Modal.Title>Edit Alert</Modal.Title>
				</Modal.Header>

				<Modal.Body>
					<form>
						<FormGroup controlId="text">
							<ControlLabel>Alert when crossing</ControlLabel>
							<FormControl type="number" value={alert.yValue} onChange={this.handleChange} />
						</FormGroup>
					</form>
				</Modal.Body>

				<Modal.Footer>
					<Button bsStyle="danger" onClick={onDeleteAlert}>Delete Alert</Button>
					<Button bsStyle="primary" onClick={this.handleSave}>Save</Button>
				</Modal.Footer>
			</Modal>
		);
	}
}

class CandleStickChartWithMA extends React.Component {
	constructor(props) {
		super(props);
		this.onKeyPress = this.onKeyPress.bind(this);
		this.onDrawComplete = this.onDrawComplete.bind(this);
		this.handleChoosePosition = this.handleChoosePosition.bind(this);

		this.saveInteractiveNodes = saveInteractiveNodes.bind(this);
		this.getInteractiveNodes = getInteractiveNodes.bind(this);

		this.handleSelection = this.handleSelection.bind(this);

		this.saveCanvasNode = this.saveCanvasNode.bind(this);

		this.handleDialogClose = this.handleDialogClose.bind(this);
		this.handleTextChange = this.handleTextChange.bind(this);

		this.onDragComplete = this.onDragComplete.bind(this);
		this.onDelete = this.onDelete.bind(this);
		this.handleChangeAlert = this.handleChangeAlert.bind(this);
		this.handleDeleteAlert = this.handleDeleteAlert.bind(this);
		this.handleDoubleClickAlert = this.handleDoubleClickAlert.bind(this);
		this.handleAlertChoosePosition = this.handleChoosePosition.bind(this);
		this.handleAlertSelection = this.handleSelection.bind(this);

		this.state = {
			enableInteractiveObject: false,
			textList_1: [],
			textList_3: [],
			showTextModal: false,
			showYModal: false,
			yCoordinateList_1: [
				{
					...InteractiveYCoordinate.defaultProps.defaultPriceCoordinate,
					yValue: this.props.marks.R1,
					id: shortid.generate(),
					draggable: true,
				},
				{
					...InteractiveYCoordinate.defaultProps.defaultPriceCoordinate,
					yValue: this.props.marks.R2,
					id: shortid.generate(),
					draggable: true,
				},
				{
					...InteractiveYCoordinate.defaultProps.defaultPriceCoordinate,
					yValue: this.props.marks.S1,
					id: shortid.generate(),
					draggable: true,
				},
				{
					...InteractiveYCoordinate.defaultProps.defaultPriceCoordinate,
					yValue: this.props.marks.S2,
					id: shortid.generate(),
					draggable: true,
				},
			],
			yCoordinateList_3: [],
			alertToEdit: {}
		};
	}
	saveCanvasNode(node) {
		this.canvasNode = node;
	}
	handleSelection(interactives, moreProps, e) {
		if (this.state.enableInteractiveObject) {
			const independentCharts = moreProps.currentCharts.filter(d => d !== 2)
			if (independentCharts.length > 0) {
				const first = head(independentCharts);

				const morePropsForChart = getMorePropsForChart(moreProps, first)
				const {
					mouseXY: [, mouseY],
					chartConfig: { yScale },
					xAccessor,
					currentItem,
				} = morePropsForChart;

				const position = [xAccessor(currentItem), yScale.invert(mouseY)];
				const newText = {
					...defaultTextStyles,
					position,
				};
				this.handleChoosePosition(newText, morePropsForChart, e);
			}
		} else {
			const state = toObject(interactives, each => {
				return [
					`textList_${each.chartId}`,
					each.objects,
				];
			});
			this.setState(state);
		}
	}
	handleChoosePosition(text, moreProps) {
		this.componentWillUnmount();
		const { id: chartId } = moreProps.chartConfig;

		this.setState({
			[`textList_${chartId}`]: [
				...this.state[`textList_${chartId}`],
				text
			],
			showTextModal: true,
			text: text.text,
			chartId
		});
	}
	handleTextChange(text, chartId) {
		const textList = this.state[`textList_${chartId}`];
		const allButLast = textList
			.slice(0, textList.length - 1);

		const lastText = {
			...last(textList),
			text,
		};

		this.setState({
			[`textList_${chartId}`]: [
				...allButLast,
				lastText
			],
			showTextModal: false,
			enableInteractiveObject: false,
		});
		this.componentDidMount();
	}

	handleAlertSelection(interactives, moreProps, e) {
		if (this.state.enableInteractiveObject) {
			const independentCharts = moreProps.currentCharts.filter(d => d !== 2);
			if (independentCharts.length > 0) {
				const first = head(independentCharts);

				const morePropsForChart = getMorePropsForChart(moreProps, first);
				const {
					mouseXY: [, mouseY],
					chartConfig: { yScale },
				} = morePropsForChart;

				const yValue = round(yScale.invert(mouseY), 2);
				const newAlert = {
					...InteractiveYCoordinate.defaultProps.defaultPriceCoordinate,
					yValue,
					id: shortid.generate()
				};
				this.handleChoosePosition(newAlert, morePropsForChart, e);
			}
		} else {
			const state = toObject(interactives, each => {
				return [
					`yCoordinateList_${each.chartId}`,
					each.objects,
				];
			});
			this.setState(state);
		}
	}
	handleAlertChoosePosition(alert, moreProps) {
		const { id: chartId } = moreProps.chartConfig;
		this.setState({
			[`yCoordinateList_${chartId}`]: [
				...this.state[`yCoordinateList_${chartId}`],
				alert
			],
			enableInteractiveObject: false,
		});
	}
	handleDoubleClickAlert(item) {
		this.setState({
			showYModal: true,
			alertToEdit: {
				alert: item.object,
				chartId: item.chartId,
			},
		});
	}
	handleChangeAlert(alert, chartId) {
		const yCoordinateList = this.state[`yCoordinateList_${chartId}`];
		const newAlertList = yCoordinateList.map(d => {
			return d.id === alert.id ? alert : d;
		});

		this.setState({
			[`yCoordinateList_${chartId}`]: newAlertList,
			showYModal: false,
			enableInteractiveObject: false,
		});
	}
	handleDeleteAlert() {
		const { alertToEdit } = this.state;
		const key = `yCoordinateList_${alertToEdit.chartId}`;
		const yCoordinateList = this.state[key].filter(d => {
			return d.id !== alertToEdit.alert.id;
		});
		this.setState({
			showYModal: false,
			alertToEdit: {},
			[key]: yCoordinateList
		});
	}

	onDelete(yCoordinate, moreProps) {
		this.setState(state => {
			const chartId = moreProps.chartConfig.id;
			const key = `yCoordinateList_${chartId}`;

			const list = state[key];
			return {
				[key]: list.filter(d => d.id !== yCoordinate.id)
			};
		});
	}

	onDragComplete(yCoordinateList, moreProps, draggedAlert) {
		// this gets called on drag complete of drawing object
		const { id: chartId } = moreProps.chartConfig;

		const key = `yCoordinateList_${chartId}`;
		const alertDragged = draggedAlert != null;

		this.setState({
			enableInteractiveObject: false,
			[key]: yCoordinateList,
			showModal: alertDragged,
			alertToEdit: {
				alert: draggedAlert,
				chartId,
			},
			originalAlertList: this.state[key],
		});
	}

	handleDialogClose() {
		this.setState({
			showTextModal: false,
			showYModal: false,
		});

				// cancel alert edit
		this.setState(state => {
			const { originalAlertList, alertToEdit } = state;
			const key = `yCoordinateList_${alertToEdit.chartId}`;
			const list = originalAlertList || state[key];

			return {
				showModal: false,
				[key]: list,
			};
		});
		this.componentDidMount();
	}

	componentDidMount() {
		document.addEventListener("keyup", this.onKeyPress);
	}
	componentWillUnmount() {
		document.removeEventListener("keyup", this.onKeyPress);
	}
	onDrawComplete(textList, moreProps) {
		// this gets called on
		// 1. draw complete of drawing object
		// 2. drag complete of drawing object
		const { id: chartId } = moreProps.chartConfig;

		this.setState({
			enableInteractiveObject: false,
			[`textList_${chartId}`]: textList,
		});
	}

	onKeyPress(e) {
		const keyCode = e.which;
		switch (keyCode) {
		case 46: {
			// DEL
			this.setState({
				textList_1: this.state.textList_1.filter(d => !d.selected),
				textList_3: this.state.textList_3.filter(d => !d.selected),
				yCoordinateList_1: this.state.yCoordinateList_1.filter(d => !d.selected),
				yCoordinateList_3: this.state.yCoordinateList_3.filter(d => !d.selected)
			});
			break;
		}
		case 27: {
			// ESC
			//this.node.terminate();
			//this.canvasNode.cancelDrag();
			this.setState({
				enableInteractiveObject: false
			});
			break;
		}
		case 68: // D - Draw drawing object
		case 69: { // E - Enable drawing object
			this.setState({
				enableInteractiveObject: true
			});
			break;
		}
		}
	}

	render() {
		const ema200 = ema()
			.options({
				windowSize: 200, // optional will default to 10
				sourcePath: "close", // optional will default to close as the source
			})
			.skipUndefined(true) // defaults to true
			.merge((d, c) => {d.ema200 = c;}) // Required, if not provided, log a error
			.accessor(d => d.ema200) // Required, if not provided, log an error during calculation
			.stroke("blue"); // Optional

		const ema50 = ema()
			.options({ windowSize: 50 })
			.merge((d, c) => {d.ema50 = c;})
			.accessor(d => d.ema50)
			.stroke("red")

		const smaVolume50 = sma()
			.options({ windowSize: 20, sourcePath: "volume" })
			.merge((d, c) => {d.smaVolume50 = c;})
			.accessor(d => d.smaVolume50)
			.fill('rgba(0,0,0,0)')
			.stroke(Colors.green);

		const { type, data: initialData, width, ratio, marks } = this.props;

		const calculatedData = ema50(ema200(smaVolume50(initialData)));
		const xScaleProvider = discontinuousTimeScaleProvider
			.inputDateAccessor(d => d.date);
		const {
			data,
			xScale,
			xAccessor,
			displayXAccessor,
		} = xScaleProvider(calculatedData);

		const start = xAccessor(last(data));
		const end = xAccessor(data[Math.max(0, data.length - 150)]);
		const xExtents = [start, end];

		const { showTextModal, showYModal, text, alertToEdit } = this.state;

		return (
			<div>
				<ChartCanvas height={600}
					width={width}
					ratio={ratio}
					margin={{ left: 70, right: 70, top: 10, bottom: 30 }}
					type={type}
					seriesName="MSFT"
					data={data}
					xScale={xScale}
					xAccessor={xAccessor}
					displayXAccessor={displayXAccessor}
					xExtents={xExtents}
				>
					<Chart id={1}
						yExtents={[d => [d.high, d.low], ema50.accessor(), ema200.accessor()]}
						padding={{ top: 10, bottom: 100 }}
					>
						<XAxis axisAt="bottom" orient="bottom"/>
						<YAxis axisAt="right" orient="right" ticks={5} />

						<MouseCoordinateY
							at="right"
							orient="right"
							displayFormat={format(".2f")} />

						<OHLCSeries stroke={d => d.close > d.open ? Colors.green : (d.open > d.close ? Colors.red : Colors.blue)}/>

						<LineSeries yAccessor={ema50.accessor()} stroke={ema50.stroke()}/>
						<LineSeries yAccessor={ema200.accessor()} stroke={ema200.stroke()}/>
						<CurrentCoordinate yAccessor={ema50.accessor()} fill={ema50.stroke()} />
						<CurrentCoordinate yAccessor={ema200.accessor()} fill={ema200.stroke()} />

						<OHLCTooltip origin={[-40, 0]}/>

						<InteractiveText
								ref={this.saveInteractiveNodes("InteractiveText", 1)}
								enabled={this.state.enableInteractiveObject}
								onDragComplete={this.onDrawComplete}
								textList={this.state.textList_1}
								hoverText={hoverTextStyles}
						/>
						<InteractiveYCoordinate
							ref={this.saveInteractiveNodes("InteractiveYCoordinate", 1)}
							enabled={this.state.enableInteractiveObject}
							onDragComplete={this.onDragComplete}
							onDelete={this.onDelete}
							yCoordinateList={this.state.yCoordinateList_1}
						/>

						<MovingAverageTooltip
							onClick={e => console.log(e)}
							origin={[-38, 15]}
							options={[
								{
									yAccessor: ema50.accessor(),
									type: "EMA",
									stroke: ema50.stroke(),
									windowSize: ema50.options().windowSize,
									echo: "some echo here",
								},
								{
									yAccessor: ema200.accessor(),
									type: "EMA",
									stroke: ema200.stroke(),
									windowSize: ema200.options().windowSize,
									echo: "some echo here",
								},
							]}
						/>

						<HoverTooltip
							yAccessor={ema50.accessor()}
							tooltipContent={tooltipContent([
								{
									label: `${ema50.type()}(${ema50.options()
										.windowSize})`,
									value: d => numberFormat(ema50.accessor()(d)),
									stroke: ema50.stroke()
								},
								{
									label: `${ema200.type()}(${ema200.options()
										.windowSize})`,
									value: d => numberFormat(ema200.accessor()(d)),
									stroke: ema200.stroke()
								}
							])}
							fontSize={15}
						/>
					</Chart>
					<Chart id={2}
						yExtents={[d => d.volume, smaVolume50.accessor()]}
						height={100} origin={(w, h) => [0, h - 100]}
					>
						<YAxis axisAt="left" orient="left" ticks={5} tickFormat={format(".2s")}/>

						<MouseCoordinateX
							at="bottom"
							orient="bottom"
							displayFormat={timeFormat("%Y-%m-%d")} />
						<MouseCoordinateY
							at="left"
							orient="left"
							displayFormat={format(".4s")} />

						<BarSeries yAccessor={d => d.volume} fill={d => d.close > d.open ? Colors.green : Colors.red} />
						<AreaSeries yAccessor={smaVolume50.accessor()} stroke={smaVolume50.stroke()} fill={smaVolume50.fill()}/>
						<CurrentCoordinate yAccessor={smaVolume50.accessor()} fill={smaVolume50.stroke()} />
						<CurrentCoordinate yAccessor={d => d.volume} fill={Colors.red} />
					</Chart>
					<CrossHairCursor />
					<DrawingObjectSelector
						enabled
						getInteractiveNodes={this.getInteractiveNodes}
						drawingObjectMap={{
							InteractiveText: "textList",
						}}
						onSelect={this.handleSelection}
					/>
				</ChartCanvas>
				<Dialog
					showModal={showTextModal}
					text={text}
					chartId={this.state.chartId}
					onClose={this.handleDialogClose}
					onSave={this.handleTextChange}
				/>
				<AlertDialog
					showModal={showYModal}
					alert={alertToEdit.alert}
					chartId={alertToEdit.chartId}
					onClose={this.handleDialogClose}
					onSave={this.handleChangeAlert}
					onDeleteAlert={this.handleDeleteAlert}
				/>
		</div>
		);
	}
}

CandleStickChartWithMA.propTypes = {
	data: PropTypes.array.isRequired,
	width: PropTypes.number.isRequired,
	ratio: PropTypes.number.isRequired,
	type: PropTypes.oneOf(["svg", "hybrid"]).isRequired,
};

CandleStickChartWithMA.defaultProps = {
	type: "svg",
};
CandleStickChartWithMA = fitWidth(CandleStickChartWithMA);

export default CandleStickChartWithMA;

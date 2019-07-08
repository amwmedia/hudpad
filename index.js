const canvas = require('canvas-prebuilt');
const rAF = require('raf');
const Launchpad = require('launchpad-mini')
const path = require('path');
const fs = require('fs-extra');
const {getHomeFolder} = require('platform-folders');
const pad = new Launchpad();
const dialog = require('dialog-node');
const marqueeAction = require('./actions/marquee');

const homePath = getHomeFolder();
const configFilePath = path.resolve(homePath, '.launchrc');
const config = {};
const saveConfig = () => fs.writeJsonSync(configFilePath, config);
if (fs.pathExistsSync(configFilePath)) {
	Object.assign(config, fs.readJsonSync(configFilePath));
} else {
	saveConfig();
}

const size = 8;
const sceneCtx = canvas.createCanvas(size, size).getContext('2d');
sceneCtx.font = '10px 5X5';

const noop = () => {};
let onDraw = noop;
const sceneAlphaMap = ['A','B','C','D','E','F','G','H'];
const createScene = (col, row) => ({
	col, row, letter: sceneAlphaMap[row],
	overviewHandlers: [],
	overviewCtx: canvas.createCanvas(size, 1).getContext('2d'),
	overviewUpdate: noop,
	overviewDraw: noop,
	sceneHandlers: [],
	sceneUpdate: noop,
	sceneDraw: noop,
	pixelCtx: canvas.createCanvas(1, 1).getContext('2d'),
	pixelUpdate: noop,
	pixelDraw: noop,
});
const state = {
	systemError: null,
	scenes: (new Array(8)).fill('').map(
		(col, colIdx) => (new Array(8)).fill('').map(
			(row, rowIdx) => createScene(colIdx, rowIdx)
		)
	),
	col: null,
	row: null,
	currentScene: null,
};

const update = () => {
	const {currentScene, scenes, col, row, systemError} = state;
	if (systemError != null) {
		state.systemError = marqueeAction.update(systemError, sceneCtx);
	} else if (col == null) {
		scenes.forEach((page, colIdx) => {
			page.forEach((scene, rowIdx) => {
				scene.pixelUpdate({ctx: scene.pixelCtx});
			})
		});
	} else if (row == null) {
		const page = scenes[col];
		page.forEach(({overviewUpdate, overviewCtx}) => {
			overviewUpdate({ctx: overviewCtx, size});
		});
	} else if (currentScene != null) {
		currentScene.sceneUpdate({ctx: sceneCtx, size});
	}

	draw();
};

const draw = () => {
	const {currentScene, scenes, col, row, systemError} = state;

	if (systemError != null) {
		marqueeAction.draw(systemError, sceneCtx);
	} else if (col == null) {
		scenes.forEach((page, colIdx) => {
			page.forEach((scene, rowIdx) => {
				scene.pixelDraw({ctx: scene.pixelCtx});
				sceneCtx.putImageData(scene.pixelCtx.getImageData(0, 0, 1, 1), colIdx, rowIdx);
			});
		})
	} else if (row == null) {
		const page = scenes[col];
		page.forEach(({overviewDraw, overviewCtx, row}) => {
			overviewDraw({ctx: overviewCtx, size});
			const rowImgData = overviewCtx.getImageData(0, 0, 8, 1);
			// console.log('rowImgData', rowImgData, row);
			sceneCtx.putImageData(rowImgData, 0, row);
		});
	} else if (currentScene != null) {
		currentScene.sceneDraw({ctx: sceneCtx, size});
	}

  const imgData = sceneCtx.getImageData(0, 0, size, size).data
    .filter((v, i) => (i + 1) % 4 === 0)
    .reduce((acc, v, i, arr) => {
      const row = acc.length-1;
      const col = acc[row].length;
			const pixelView = state.col == null && state.row == null;
			const pixelHasCfg = config[col] && config[col][row];
      acc[row].push(
        (v > 150 ? [col, row, pad.red.full]
        : (v > 125 ? [col, row, pad.red.medium]
        : (v > 100 ? [col, row, pad.red.low]
        : (pixelView && pixelHasCfg ? [col, row, pad.green.medium]
				:	[col, row, pad.off]
				))))
      );
      if ((i + 1) % 8 === 0 && i < (arr.length-1)) {acc.push([]);}
      return acc;
    }, [[]]);

	let buttonData = imgData.reduce((acc, v) => acc.concat(v), []);
	// console.clear();
	for(let btnIdx = 8; btnIdx--;) {
		buttonData.push(
			// top buttons
			[btnIdx, 8, (col === btnIdx
				? pad.green
				: (scenes[btnIdx].some(r => r.pixelDraw !== noop)
					? pad.amber.low
					: pad.off
				)
			)],
			// side buttons
			[8, btnIdx, (row === btnIdx
				? pad.green
				: (col == null || scenes[col][btnIdx].pixelDraw === noop
					? pad.off
					: pad.amber.low
				)
			)]
		);
		// console.log('btnIdx', btnIdx);
	}

  pad.setColors(buttonData);
  onDraw(buttonData);
  // console.log(imgData.reduce((acc, v) => acc.concat(v), []));
	rAF(update);
};

const launchApi = scene => ({
	overview: {
		update: f => scene.overviewUpdate = f,
		draw: f => scene.overviewDraw = f,
		onKey: f => {
			scene.overviewHandlers.push(f);
			return () => scene.overviewHandlers = scene.overviewHandlers.filter(h => h !== f);
		}
	},
	scene: {
		update: f => scene.sceneUpdate = f,
		draw: f => scene.sceneDraw = f,
		onKey: f => {
			scene.sceneHandlers.push(f);
			return () => scene.sceneHandlers = scene.sceneHandlers.filter(h => h !== f);
		}
	},
	pixel: {
		update: f => scene.pixelUpdate = f,
		draw: f => scene.pixelDraw = f
	},
	marquee: marqueeAction,
});

const unloadSceneAtLocation = (colIdx, rowIdx) => {
	delete config[colIdx][rowIdx];
	if (Object.keys(config[colIdx]).length === 0) { delete config[colIdx]; }
	state.scenes[colIdx][rowIdx] = createScene(colIdx, rowIdx);
	saveConfig();
};
const loadSceneAtLocation = (scenePath, colIdx, rowIdx) => {
	try {
		require(scenePath)(launchApi(state.scenes[colIdx][rowIdx]));
		saveConfig();
	} catch (err) {
		dialog.error(
			err.message, `ERROR LOADING (page ${colIdx + 1}, row ${sceneAlphaMap[rowIdx]})`,
			0, function () {
				unloadSceneAtLocation(colIdx, rowIdx);
			}
		);
	}
};

let keyDownTimer;
const init = () => {
	pad.on( 'key', k => {
		// Make button red while pressed, green after pressing
		const {x, y, pressed} = k;
		const {col, row, scenes} = state;

		clearTimeout(keyDownTimer)
		if (col == null && row == null && x < 8 && y < 8 && pressed) {
			keyDownTimer = setTimeout(() => {
				const hasConfig = config[x] != null && config[x][y] != null;
				if (hasConfig) {
					unloadSceneAtLocation(x, y);
				} else {
					dialog.fileselect('pick a file', 'pick a file title', null, function (code, val) {
						const filePath = val
						.replace(/:/g, '/')
						.replace('HD/', '/')
						.replace('sh ', '');
						if (filePath && filePath.endsWith('.js')) {
							config[x] = config[x] || {};
							config[x][y] = filePath;
							loadSceneAtLocation(filePath, x, y);
						}
					});
				}
			}, 2000);
		}

		if (y === 8 && !pressed) {
			// col change
			state.col = (col === x ? null : x);
			if (state.col == null) { state.row = null; }
		} else if (x === 8 && !pressed && col != null) {
			// row change
			state.row = (row === y ? null : y);
		} else if (x < 8 && y < 8 && col != null && row == null && scenes[col][y].pixelDraw !== noop && !pressed) {
			// overview key pressed
			scenes[col][y].overviewHandlers.forEach(h => h(x));
		} else if (x < 8 && y < 8 && col != null && row != null && !pressed) {
			// scene key pressed
			scenes[col][row].sceneHandlers.forEach(h => h(x, y));
		} else if (x < 8 && y < 8 && scenes[x][y].pixelDraw !== noop && !pressed) {
			// jump into the selected function
			if (col == null && scenes[x][y].pixelDraw !== noop) {
				state.col = x;
				state.row = y;
			}
		}

		state.currentScene = (state.col != null && state.row != null
			? scenes[state.col][state.row]
			: null
		);
  } );
	draw();
};

pad.connect().then(() => {
	// load scenes
	state.scenes.forEach((page, colIdx) => {
		if (config[colIdx] == null) { return; }
		page.forEach((scene, rowIdx) => {
			const scenePath = config[colIdx][rowIdx];
			if (scenePath == null) { return; }
			if (!fs.pathExistsSync(scenePath)) {
				dialog.error(
					`NOT FOUND: "${scenePath}"`,
					`ERROR LOADING (page ${colIdx + 1}, row ${sceneAlphaMap[rowIdx]})`,
					0, function () {
						unloadSceneAtLocation(colIdx, rowIdx);
					}
				);
			} else {
				loadSceneAtLocation(scenePath, colIdx, rowIdx);
			}
		})
	});
	// run!
  init();
});

module.exports = {
  onDraw: f => onDraw = f
};

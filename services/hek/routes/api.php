<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\EienaarController;
use App\Http\Controllers\ExportController;
use App\Http\Controllers\FarmController;
use App\Http\Controllers\ManagementController;
use App\Http\Controllers\MasterDataController;
use App\Http\Controllers\PairingController;
use App\Http\Controllers\PieceworkController;
use App\Http\Controllers\SeasonController;
use App\Http\Controllers\StockController;
use App\Http\Controllers\SyncController;
use App\Http\Controllers\TicketController;
use App\Http\Controllers\WaterController;
use App\Http\Controllers\WeatherController;
use App\Http\Controllers\WerkswinkelController;
use Illuminate\Support\Facades\Route;

/*
 * Every path the office and field apps call. The same paths and JSON the Node API had, so the apps did
 * not change (ADR 0014).
 */

// No session yet: logins, the printed pairing QR, the public ticket key.
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/management/login', [ManagementController::class, 'login']);
Route::post('/pair/{token}', [PairingController::class, 'pair']);
Route::get('/.well-known/jwks.json', [TicketController::class, 'jwks']);

// Plaashek Management: cross-farm.
Route::middleware('management')->group(function () {
    Route::get('/management/farms', [ManagementController::class, 'farms']);
    Route::post('/management/farms', [ManagementController::class, 'createFarm']);
    Route::put('/management/farms/{farmId}/entitlements', [ManagementController::class, 'setEntitlement']);
    Route::post('/management/farms/{farmId}/logins', [ManagementController::class, 'createLogin']);
});

// A paired phone, by its ticket.
Route::middleware('device')->group(function () {
    Route::post('/tickets/refresh', [TicketController::class, 'refresh']);
    Route::post('/sync/upload', [SyncController::class, 'upload']);
    Route::get('/weather/current', [WeatherController::class, 'current']);
    Route::get('/blocks', [MasterDataController::class, 'fieldBlocks']);
    Route::get('/pickers', [PieceworkController::class, 'pickers']);
    Route::get('/stock-catalog', [StockController::class, 'catalog']);
    Route::get('/water-catalog', [WaterController::class, 'catalog']);
    Route::get('/assets', [WerkswinkelController::class, 'assets']);
    Route::get('/work-orders/open', [WerkswinkelController::class, 'open']);
});

// The farm office: Farm Admin Tool and Owner Module.
Route::middleware('staff:admin,owner')->group(function () {
    Route::get('/farm', [FarmController::class, 'show']);
    Route::get('/farm/weather', [WeatherController::class, 'farm']);

    Route::get('/devices', [DeviceController::class, 'index']);
    Route::post('/devices', [DeviceController::class, 'store']);
    Route::post('/devices/{deviceId}/apps', [DeviceController::class, 'addApp']);
    Route::post('/devices/{deviceId}/revoke', [DeviceController::class, 'revoke']);
    Route::post('/pairing-tokens/{id}/reprint', [PairingController::class, 'reprint']);
    Route::post('/pairing-tokens/{id}/cancel', [PairingController::class, 'cancel']);

    Route::get('/seasons', [SeasonController::class, 'index']);
    Route::post('/seasons', [SeasonController::class, 'store']);
    Route::patch('/seasons/{id}', [SeasonController::class, 'update']);

    Route::post('/people', [MasterDataController::class, 'person']);
    Route::post('/blocks', [MasterDataController::class, 'block']);
    Route::post('/camps', [MasterDataController::class, 'camp']);
    Route::post('/assets', [MasterDataController::class, 'asset']);

    Route::get('/eienaar/harvest', [EienaarController::class, 'harvest']);
    Route::get('/eienaar/attendance', [EienaarController::class, 'attendance']);
    Route::get('/eienaar/veldnotas', [EienaarController::class, 'veldnotas']);
    Route::get('/eienaar/stock', [StockController::class, 'onHand']);
    Route::get('/eienaar/water', [WaterController::class, 'latest']);
    Route::get('/eienaar/werkswinkel', [WerkswinkelController::class, 'office']);

    Route::get('/stock-items', [StockController::class, 'index']);
    Route::get('/water-points', [WaterController::class, 'index']);

    Route::get('/piecework/workers', [PieceworkController::class, 'workers']);
    Route::get('/piece-rates', [PieceworkController::class, 'rates']);
    Route::get('/piecework/payout', [PieceworkController::class, 'payout']);
    Route::get('/piecework/unattributed', [PieceworkController::class, 'unattributed']);

    Route::get('/export/notes.csv', [ExportController::class, 'notes']);
    Route::get('/export/harvest.csv', [ExportController::class, 'harvest']);
    Route::get('/export/attendance.csv', [ExportController::class, 'attendance']);
    Route::get('/export/stock.csv', [ExportController::class, 'stock']);
    Route::get('/export/water.csv', [ExportController::class, 'water']);
    Route::get('/export/work-orders.csv', [ExportController::class, 'workOrders']);
    Route::get('/export/fuel.csv', [ExportController::class, 'fuel']);
    Route::get('/export/piecework.csv', [ExportController::class, 'piecework']);
    Route::get('/export/workers.csv', [PieceworkController::class, 'exportWorkers']);
});

// Admin only: the owner reads, the office sets.
Route::middleware('staff:admin')->group(function () {
    Route::put('/farm/coordinates', [FarmController::class, 'coordinates']);

    Route::post('/stock-items', [StockController::class, 'store']);
    Route::patch('/stock-items/{itemId}', [StockController::class, 'update']);
    Route::post('/water-points', [WaterController::class, 'store']);
    Route::patch('/water-points/{pointId}', [WaterController::class, 'update']);

    Route::post('/piecework/workers', [PieceworkController::class, 'createWorker']);
    Route::patch('/piecework/workers/{personId}', [PieceworkController::class, 'updateWorker']);
    Route::post('/piecework/workers/import', [PieceworkController::class, 'import']);
    Route::post('/piece-rates', [PieceworkController::class, 'createRate']);
});

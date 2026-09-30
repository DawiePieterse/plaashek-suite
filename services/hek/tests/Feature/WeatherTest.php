<?php

use Illuminate\Support\Facades\Http;

beforeEach(function () {
    Http::preventStrayRequests();
});

function fakeOpenMeteo(int $status = 200): void
{
    Http::fake(['api.open-meteo.com/*' => Http::response(
        $status === 200 ? ['current' => ['temperature_2m' => 24.3, 'relative_humidity_2m' => 51, 'weather_code' => 2]] : ['error' => true],
        $status,
    )]);
}

it('gives a paired phone the weather at its own fix', function () {
    fakeOpenMeteo();
    $p = pairedPhone('veldnotas');

    $this->getJson('/weather/current?lat=-25.5&lon=31.6', bearer(ticketFor($p['farm'], $p['device'], ['veldnotas'])))
        ->assertOk()
        ->assertExactJson(['temp' => 24.3, 'humidity' => 51, 'condition' => 'partly_cloudy']);

    Http::assertSent(fn ($request) => str_contains($request->url(), 'latitude=-25.5') && str_contains($request->url(), 'longitude=31.6'));
});

it('refuses weather without a ticket or with coordinates out of range', function () {
    fakeOpenMeteo();
    $p = pairedPhone('veldnotas');

    $this->getJson('/weather/current?lat=-25.5&lon=31.6')->assertUnauthorized();
    $this->getJson('/weather/current?lat=-95&lon=31.6', bearer(ticketFor($p['farm'], $p['device'], ['veldnotas'])))->assertStatus(400);
    $this->getJson('/weather/current?lat=abc&lon=31.6', bearer(ticketFor($p['farm'], $p['device'], ['veldnotas'])))->assertStatus(400);
});

it('gives the office the weather at the farm\'s stored point, and says when there is none', function () {
    fakeOpenMeteo();
    $s = seedFarm();

    $this->getJson('/farm/weather', bearer(staffToken($s)))->assertStatus(409)->assertJsonPath('error.code', 'no_coordinates');

    central()->table('farms')->where('id', $s['farm']['id'])->update(['latitude' => -25.57, 'longitude' => 31.61]);
    $this->getJson('/farm/weather', bearer(staffToken($s)))->assertOk()->assertJsonPath('condition', 'partly_cloudy');
});

it('answers 502 when Open-Meteo fails, and does not cache the failure', function () {
    Http::fake(['api.open-meteo.com/*' => Http::sequence()
        ->push(['error' => true], 500)
        ->push(['current' => ['temperature_2m' => 24.3, 'relative_humidity_2m' => 51, 'weather_code' => 2]])]);
    $p = pairedPhone('veldnotas');
    $h = bearer(ticketFor($p['farm'], $p['device'], ['veldnotas']));

    $this->getJson('/weather/current?lat=-25.5&lon=31.6', $h)->assertStatus(502)->assertJsonPath('error.code', 'weather_unavailable');
    $this->getJson('/weather/current?lat=-25.5&lon=31.6', $h)->assertOk()->assertJsonPath('temp', 24.3);
});

it('shares one upstream call between nearby asks within five minutes', function () {
    fakeOpenMeteo();
    $p = pairedPhone('veldnotas');
    $h = bearer(ticketFor($p['farm'], $p['device'], ['veldnotas']));

    $this->getJson('/weather/current?lat=-25.501&lon=31.601', $h)->assertOk();
    $this->getJson('/weather/current?lat=-25.502&lon=31.602', $h)->assertOk();

    Http::assertSentCount(1);
});

<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthEndpointsTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_health_endpoint_exposes_only_status(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson(['status' => 'ok']);
    }

    public function test_readiness_endpoint_checks_local_dependencies_without_details(): void
    {
        $this->getJson('/api/health/ready')
            ->assertOk()
            ->assertExactJson(['status' => 'ok']);
    }
}

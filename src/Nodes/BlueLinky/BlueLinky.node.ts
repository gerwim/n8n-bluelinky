import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import {BlueLinky as BlueLinkyPackage} from 'bluelinky';
import {EULanguages} from "bluelinky/dist/constants/europe";

type StartOptions = {
	airCtrl?: boolean;
	defrost?: boolean;
	heatingTemp?: number;
	igniOnDuration?: number;
};

type BlueLinkyClient = InstanceType<typeof BlueLinkyPackage>;

async function initClient(this: IExecuteFunctions): Promise<BlueLinkyClient> {
	const credentials = await this.getCredentials('blueLinkyApi');

	if (!credentials) {
		throw new NodeOperationError(this.getNode(), 'Missing BlueLinky credentials');
	}

	// @ts-ignore -- brand is missing, only required in v10 of Bluelinky
	const client = new BlueLinkyPackage({
		username: credentials.username as string,
		password: credentials.password as string,
		region: credentials.region as "US" | "CA" | "EU" | "CN" | "AU",
		language: (credentials.language || 'en') as EULanguages,
		pin: (credentials.pin || undefined) as string | undefined,
	});

	await client.login();

	return client;
}

async function resolveVehicle(client: BlueLinkyClient, vin?: string, index?: number): Promise<any> {
	const vehicles = await client.getVehicles();
	if (!vehicles || vehicles.length === 0) {
		throw new Error('No vehicles found for this BlueLinky account.');
	}

	if (vin) {
		const match = vehicles.find((v: any) => v.vin === vin || v.vehicleConfig?.vin === vin);
		if (!match) {
			throw new Error(`Vehicle with VIN ${vin} not found.`);
		}
		return match;
	}

	const i = typeof index === 'number' ? index : 0;
	if (i < 0 || i >= vehicles.length) {
		throw new Error(`Vehicle index ${i} is out of bounds (found ${vehicles.length} vehicles).`);
	}
	return vehicles[i];
}

export class BlueLinky implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BlueLinky',
		name: 'blueLinky',
		icon: 'file:bluelinky.svg',
		group: ['transform'],
		version: 1,
		description: 'Control Hyundai/Kia vehicles via the bluelinky library',
		defaults: {
			name: 'BlueLinky',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'blueLinkyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'List Vehicles', value: 'listVehicles', description: 'Get a list of vehicles' },
					{ name: 'Get Vehicle Status', value: 'getStatus', description: 'Fetch current vehicle status' },
					{ name: 'Get Location', value: 'getLocation', description: 'Fetch current vehicle location' },
					{ name: 'Get Odometer', value: 'getOdometer', description: 'Fetch current vehicle odometer' },
					{ name: 'Lock', value: 'lock', description: 'Lock the vehicle' },
					{ name: 'Unlock', value: 'unlock', description: 'Unlock the vehicle' },
					{ name: 'Start Engine/Climate', value: 'startEngine', description: 'Start engine or climate with options' },
					{ name: 'Stop Engine/Climate', value: 'stopEngine', description: 'Stop engine or climate' },
				],
				default: 'listVehicles',
			},

			// Vehicle selection
			{
				displayName: 'VIN',
				name: 'vin',
				type: 'string',
				default: '',
				placeholder: 'Optional VIN to target a specific vehicle',
				description: 'If empty, vehicle index will be used',
				displayOptions: {
					show: {
						operation: ['getStatus', 'getLocation', 'getOdometer', 'lock', 'unlock', 'startEngine', 'stopEngine'],
					},
				},
			},
			{
				displayName: 'Vehicle Index',
				name: 'vehicleIndex',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Index of the vehicle to use when VIN is not provided',
				displayOptions: {
					show: {
						operation: ['getStatus', 'getLocation', 'getOdometer', 'lock', 'unlock', 'startEngine', 'stopEngine'],
					},
				},
			},

			// Start options
			{
				displayName: 'Start Options',
				name: 'startOptions',
				type: 'collection',
				default: {},
				placeholder: 'Add Option',
				options: [
					{
						displayName: 'Air Control',
						name: 'airCtrl',
						type: 'boolean',
						default: true,
						description: 'Enable climate control',
					},
					{
						displayName: 'Defrost',
						name: 'defrost',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Heating Temperature (°C)',
						name: 'heatingTemp',
						type: 'number',
						typeOptions: { minValue: 16, maxValue: 32 },
						default: 22,
						description: 'Target temperature for climate start (if supported)',
					},
					{
						displayName: 'Duration (minutes)',
						name: 'igniOnDuration',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 30 },
						default: 10,
						description: 'How long to run the engine/climate',
					},
				],
				displayOptions: {
					show: {
						operation: ['startEngine'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];

		const operation = this.getNodeParameter('operation', 0) as string;

		const client: BlueLinkyClient = await initClient.call(this);

		try {
			if (operation === 'listVehicles') {
				const vehicles = await client.getVehicles();
				const data = vehicles.map((v) => ({
					vin: v.vin() ?? v.vehicleConfig?.vin,
					id: v.id() ?? null,
					nickname: v.nickname() ?? v.name() ?? null,
				}));
				returnData.push(...data.map((d: any) => ({ json: d })));
			} else if (operation === 'getStatus') {
				const vin = this.getNodeParameter('vin', 0, '') as string;
				const index = this.getNodeParameter('vehicleIndex', 0, 0) as number;
				const vehicle = await resolveVehicle(client, vin || undefined, index);
				// Many setups support a status method with parsed/refresh flags
				const status = await vehicle.status?.({ parsed: true, refresh: true })
					?? await vehicle.fullStatus?.({ parsed: true, refresh: true });
				returnData.push({ json: status ?? { message: 'No status returned' } });
			} else if (operation === 'getLocation') {
				const vin = this.getNodeParameter('vin', 0, '') as string;
				const index = this.getNodeParameter('vehicleIndex', 0, 0) as number;
				const vehicle = await resolveVehicle(client, vin || undefined, index);
				const location = await vehicle.location?.();
				returnData.push({ json: location ?? { message: 'No location returned' } });
			} else if (operation === 'getOdometer') {
				const vin = this.getNodeParameter('vin', 0, '') as string;
				const index = this.getNodeParameter('vehicleIndex', 0, 0) as number;
				const vehicle = await resolveVehicle(client, vin || undefined, index);

				let odo = await vehicle.odometer();

				returnData.push({ json: odo ?? { message: 'No odometer returned' } });
			} else if (operation === 'lock') {
				const vin = this.getNodeParameter('vin', 0, '') as string;
				const index = this.getNodeParameter('vehicleIndex', 0, 0) as number;
				const vehicle = await resolveVehicle(client, vin || undefined, index);
				const res = await vehicle.lock();
				returnData.push({ json: res ?? { success: true } });
			} else if (operation === 'unlock') {
				const vin = this.getNodeParameter('vin', 0, '') as string;
				const index = this.getNodeParameter('vehicleIndex', 0, 0) as number;
				const vehicle = await resolveVehicle(client, vin || undefined, index);
				const res = await vehicle.unlock();
				returnData.push({ json: res ?? { success: true } });
			} else if (operation === 'startEngine') {
				const vin = this.getNodeParameter('vin', 0, '') as string;
				const index = this.getNodeParameter('vehicleIndex', 0, 0) as number;
				const startOptions = this.getNodeParameter('startOptions', 0, {}) as StartOptions;
				const vehicle = await resolveVehicle(client, vin || undefined, index);
				const res = await vehicle.start(startOptions);
				returnData.push({ json: res ?? { success: true } });
			} else if (operation === 'stopEngine') {
				const vin = this.getNodeParameter('vin', 0, '') as string;
				const index = this.getNodeParameter('vehicleIndex', 0, 0) as number;
				const vehicle = await resolveVehicle(client, vin || undefined, index);
				const res = await vehicle.stop();
				returnData.push({ json: res ?? { success: true } });
			} else {
				throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
			}
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw error;
			}
			throw new NodeOperationError(this.getNode(), (error as Error).message);
		}

		return [returnData];
	}
}

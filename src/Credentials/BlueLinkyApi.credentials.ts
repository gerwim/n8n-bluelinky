import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class BlueLinkyApi implements ICredentialType {
	name = 'blueLinkyApi';
	displayName = 'BlueLinky API';
	documentationUrl = 'https://www.npmjs.com/package/bluelinky';
	properties: INodeProperties[] = [
		{
			displayName: 'Username (Email)',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'options',
			default: 'EU',
			required: true,
			options: [
				{ name: 'EU', value: 'EU' },
				{ name: 'US', value: 'US' },
				{ name: 'CA', value: 'CA' }
			],
			description: 'Select the region of your BlueLink account',
		},
		{
			displayName: 'Brand',
			name: 'brand',
			type: 'options',
			default: 'hyundai',
			required: true,
			options: [
				{ name: 'Hyundai', value: 'hyundai' },
				{ name: 'Kia', value: 'kia' },
				{ name: 'Genesis', value: 'genesis' }
			],
		},
		{
			displayName: 'Language',
			name: 'language',
			type: 'string',
			default: 'en',
			description: 'Language used for API requests (e.g., en, de, fr)',
		},
		{
			displayName: 'PIN',
			name: 'pin',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Security PIN; required for some actions in certain regions',
		},
	];
}

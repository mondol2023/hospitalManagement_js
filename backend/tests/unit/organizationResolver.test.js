'use strict';

const { createResolver, subdomainOf } = require('../../src/services/organizationResolver');

const ROOT = 'app.example.com';
const make = () => {
  const deps = {
    findOrganizationId: jest.fn(async (f) =>
      f.code === 'LEBL' || f.subdomain === 'lebl' ? 'org-lebl' : null
    ),
    findUserOrganizations: jest.fn(async () => ['org-email']),
  };
  return { deps, resolver: createResolver({ deps, rootDomain: ROOT }) };
};

describe('organizationResolver', () => {
  it('prefers organizationCode over host over email', async () => {
    const { deps, resolver } = make();
    const all = { organizationCode: 'lebl', host: 'other.app.example.com', email: 'a@b.co' };
    expect(await resolver.resolve(all)).toEqual({ organizationId: 'org-lebl' });
    expect(deps.findOrganizationId).toHaveBeenCalledWith({ code: 'LEBL' });
    expect(deps.findUserOrganizations).not.toHaveBeenCalled();

    expect(await resolver.resolve({ host: 'lebl.app.example.com', email: 'a@b.co' })).toEqual({
      organizationId: 'org-lebl',
    });
    expect(deps.findUserOrganizations).not.toHaveBeenCalled();

    expect(await resolver.resolve({ email: 'a@b.co' })).toEqual({ organizationId: 'org-email' });
  });

  it('returns candidates when the email exists in several organisations', async () => {
    const { deps, resolver } = make();
    deps.findUserOrganizations.mockResolvedValue(['a', 'b']);
    expect(await resolver.resolve({ email: 'a@b.co' })).toEqual({ candidates: ['a', 'b'] });
  });

  it.each([
    ['lebl.app.example.com', 'lebl'],
    ['LEBL.App.Example.com:443', 'lebl'],
  ])('host %s resolves %s', async (host, sub) => {
    const { deps, resolver } = make();
    await resolver.resolve({ host });
    expect(deps.findOrganizationId).toHaveBeenCalledWith({ subdomain: sub });
  });

  it.each(['app.example.com', '10.0.0.5', 'evil-app.example.com', 'lebl.app.example.com.evil.net', ''])(
    'host %s resolves nothing',
    async (host) => {
      const { deps, resolver } = make();
      expect(subdomainOf(host, ROOT)).toBeNull();
      expect(await resolver.resolve({ host }, { allowEmailLookup: false })).toBeNull();
      expect(deps.findOrganizationId).not.toHaveBeenCalled();
    }
  );

  it('email lookup is skipped when allowEmailLookup is false', async () => {
    const { deps, resolver } = make();
    expect(await resolver.resolve({ email: 'a@b.co' }, { allowEmailLookup: false })).toBeNull();
    expect(deps.findUserOrganizations).not.toHaveBeenCalled();
  });
});

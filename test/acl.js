import { ensureErc1820RegistryIsDeployed } from '../migrations/utils/erc1820'
import { extractEventArgs } from './utils'
import { events } from '../'
import { toHex, toWei, sha3 } from './utils/web3'

const ACL = artifacts.require("./base/ACL")

contract('ACL', accounts => {
  const role1 = sha3('testrole1')
  const role2 = sha3('testrole2')

  let acl

  before(async () => {
    await ensureErc1820RegistryIsDeployed({ artifacts, accounts, web3 })
  })

  beforeEach(async () => {
    acl = await ACL.new({ from: accounts[0] })
  })

  it('default account is initial admin', async () => {
    await acl.numAdmins().should.eventually.eq(1)
    await acl.isAdmin(accounts[0]).should.eventually.eq(true)
    await acl.isAdmin(accounts[1]).should.eventually.eq(false)
  })

  describe('can have new admin proposed', () => {
    it('but not by a non-admin', async () => {
      await acl.proposeNewAdmin(accounts[1], { from: accounts[2] }).should.be.rejectedWith('unauthorized')
    })

    it('unless they have already been proposed', async () => {
      await acl.proposeNewAdmin(accounts[1]).should.be.fulfilled
      await acl.proposeNewAdmin(accounts[1]).should.be.rejectedWith('already proposed')
    })

    it('unless they are already an admin', async () => {
      await acl.proposeNewAdmin(accounts[0]).should.be.rejectedWith('already an admin')
    })

    it('by an admin', async () => {
      await acl.proposeNewAdmin(accounts[1]).should.be.fulfilled
      await acl.pendingAdmins(accounts[1]).should.eventually.eq(true)
    })

    it('and emits an event when successful', async () => {
      const result = await acl.proposeNewAdmin(accounts[1])

      expect(extractEventArgs(result, events.AdminProposed)).to.include({
        addr: accounts[1]
      })
    })
  })

  describe('can have new admin proposal cancelled', () => {
    beforeEach(async () => {
      await acl.proposeNewAdmin(accounts[1]).should.be.fulfilled
    })

    it('but not by a non-admin', async () => {
      await acl.cancelNewAdminProposal(accounts[1], { from: accounts[2] }).should.be.rejectedWith('unauthorized')
    })

    it('but not if not proposed', async () => {
      await acl.cancelNewAdminProposal(accounts[2]).should.be.rejectedWith('not proposed')
    })

    it('by an admin', async () => {
      await acl.cancelNewAdminProposal(accounts[1]).should.be.fulfilled
      await acl.pendingAdmins(accounts[1]).should.eventually.eq(false)
    })

    it('and emits an event when successful', async () => {
      const result = await acl.cancelNewAdminProposal(accounts[1]).should.be.fulfilled

      expect(extractEventArgs(result, events.AdminProposalCancelled)).to.include({
        addr: accounts[1]
      })
    })
  })

  describe('can have someone accept their proposed new admin role', () => {
    beforeEach(async () => {
      await acl.proposeNewAdmin(accounts[2]).should.be.fulfilled
    })

    it('but not if they haven\'t been proposed', async () => {
      await acl.acceptAdminRole({ from: accounts[1] }).should.be.rejectedWith('not proposed')
    })

    it('but not if their proposal has been cancelled', async () => {
      await acl.cancelNewAdminProposal(accounts[2]).should.be.fulfilled
      await acl.acceptAdminRole({ from: accounts[2] }).should.be.rejectedWith('not proposed')
    })

    it('if they have actually been proposed', async () => {
      await acl.acceptAdminRole({ from: accounts[2] }).should.be.fulfilled
      await acl.isAdmin(accounts[2]).should.eventually.eq(true)
      await acl.numAdmins().should.eventually.eq(2)
    })

    it('and emits an event when successful', async () => {
      const result = await acl.acceptAdminRole({ from: accounts[2] }).should.be.fulfilled

      expect(extractEventArgs(result, events.AdminProposalAccepted)).to.include({
        addr: accounts[2]
      })
    })
  })

  describe('can have someone removed as admin', () => {
    beforeEach(async () => {
      await acl.proposeNewAdmin(accounts[2]).should.be.fulfilled
      await acl.acceptAdminRole({ from: accounts[2] }).should.be.fulfilled
      await acl.numAdmins().should.eventually.eq(2)
    })

    it('but not by a non-admin', async () => {
      await acl.removeAdmin(accounts[2], { from: accounts[1] }).should.be.rejectedWith('unauthorized')
    })

    it('but not if the person being removed is not an admin', async () => {
      await acl.removeAdmin(accounts[1]).should.be.rejectedWith('not an admin')
    })

    it('but not if they try to remove themselves', async () => {
      await acl.removeAdmin(accounts[0]).should.be.rejectedWith('cannot remove oneself')
    })

    it('but not if they are the last admin', async () => {
      await acl.removeAdmin(accounts[0], { from: accounts[2] }).should.be.fulfilled
      await acl.removeAdmin(accounts[2], { from: accounts[2] }).should.be.rejectedWith('cannot remove last admin')
    })

    it('by another admin', async () => {
      await acl.removeAdmin(accounts[0], { from: accounts[2] }).should.be.fulfilled
      await acl.isAdmin(accounts[0]).should.eventually.eq(false)
      await acl.numAdmins().should.eventually.eq(1)
    })

    it('and emits an event when successful', async () => {
      const result = await acl.removeAdmin(accounts[0], { from: accounts[2] }).should.be.fulfilled

      expect(extractEventArgs(result, events.AdminRemoved)).to.include({
        addr: accounts[0]
      })
    })
  })

  describe('can have a role group set', async () => {
    const group1 = sha3('group1')

    it('but not by a non-admin', async () => {
      await acl.setRoleGroup(group1, [ role1, role2 ], { from: accounts[1] }).should.be.rejectedWith('unauthorized')
    })

    it('by an admin', async () => {
      await acl.setRoleGroup(group1, [ role1, role2 ]).should.be.fulfilled
      await acl.roleGroups(group1, 0).should.eventually.eq(role1)
      await acl.roleGroups(group1, 1).should.eventually.eq(role2)
    })

    it('and it works with role checking', async () => {
      await acl.assignRole('context', accounts[1], role2)

      await acl.setRoleGroup(group1, [ role1 ]).should.be.fulfilled
      await acl.hasRoleInGroup('context', group1, accounts[1]).should.eventually.eq(false)

      await acl.setRoleGroup(group1, [ role1, role2 ]).should.be.fulfilled
      await acl.hasRoleInGroup('context', group1, accounts[1]).should.eventually.eq(true)

      await acl.setRoleGroup(group1, []).should.be.fulfilled
      await acl.hasRoleInGroup('context', group1, accounts[1]).should.eventually.eq(false)
    })

    it('and emits an event when successful', async () => {
      const result = await acl.setRoleGroup(group1, [ role1, role2 ]).should.be.fulfilled

      expect(extractEventArgs(result, events.RoleGroupUpdated)).to.include({
        roleGroup: group1
      })
    })
  })

  describe('can have a role assigned', async () => {
    it('but not by a non-admin', async () => {
      await acl.assignRole('test', accounts[2], role1, { from: accounts[1] }).should.be.rejectedWith('unauthorized')
    })

    it('by an admin', async () => {
      await acl.hasRole('test', accounts[2], role1).should.eventually.eq(false)
      await acl.assignRole('test', accounts[2], role1).should.be.fulfilled
      await acl.hasRole('test', accounts[2], role1).should.eventually.eq(true)
    })

    it('and emits an event when successful', async () => {
      const result = await acl.assignRole('test', accounts[2], role1).should.be.fulfilled

      expect(extractEventArgs(result, events.RoleAssigned)).to.include({
        context: 'test',
        addr: accounts[2],
        role: role1,
      })
    })
  })

  describe('can have a role unassigned', async () => {
    beforeEach(async () => {
      await acl.assignRole('test', accounts[2], role1).should.be.fulfilled
    })

    it('but not by a non-admin', async () => {
      await acl.unassignRole('test', accounts[2], role1, { from: accounts[1] }).should.be.rejectedWith('unauthorized')
    })

    it('by an admin', async () => {
      await acl.unassignRole('test', accounts[2], role1).should.be.fulfilled
      await acl.hasRole('test', accounts[2], role1).should.eventually.eq(false)
    })

    it('and emits an event when successful', async () => {
      const result = await acl.unassignRole('test', accounts[2], role1)

      expect(extractEventArgs(result, events.RoleUnassigned)).to.include({
        context: 'test',
        addr: accounts[2],
        role: role1,
      })
    })
  })

  describe('allows for multiple roles to be assigned to someone', async () => {
    beforeEach(async () => {
      await acl.assignRole('context1', accounts[2], role1).should.be.fulfilled
      await acl.assignRole('context1', accounts[2], role2).should.be.fulfilled

      await acl.assignRole('context2', accounts[2], role1).should.be.fulfilled
    })

    it('and can test for any of them', async () => {
      await acl.hasRole('context1', accounts[2], role1).should.eventually.eq(true)
      await acl.hasRole('context1', accounts[2], role2).should.eventually.eq(true)
      await acl.hasAnyRole('context1', accounts[2], [ role1, role2 ]).should.eventually.eq(true)

      await acl.hasRole('context2', accounts[2], role1).should.eventually.eq(true)
      await acl.hasAnyRole('context2', accounts[2], [ role1, role2 ]).should.eventually.eq(true)
    })
  })

  describe('allows for an assigner to be added for a given role', async () => {
    it('but not by a non-admin', async () => {
      await acl.addAssigner('test', accounts[2], role1, { from: accounts[1] }).should.be.rejectedWith('unauthorized')
    })

    it('by an admin', async () => {
      await acl.addAssigner('test', accounts[2], role1).should.be.fulfilled
      await acl.isAssigner('test', accounts[2], role1).should.eventually.eq(true)
    })

    it('who can then assign and unassign roles', async () => {
      await acl.assignRole('test', accounts[1], role1, { from: accounts[2] }).should.be.rejectedWith('unauthorized')
      await acl.addAssigner('test', accounts[2], role1).should.be.fulfilled
      await acl.assignRole('test', accounts[1], role1, { from: accounts[2] }).should.be.fulfilled
      await acl.hasRole('test', accounts[1], role1).should.eventually.eq(true)
      await acl.unassignRole('test', accounts[1], role1, { from: accounts[2] }).should.be.fulfilled
      await acl.hasRole('test', accounts[1], role1).should.eventually.eq(false)
    })

    it('who still can\'t assign arbitrary roles', async () => {
      await acl.addAssigner('test', accounts[2], role1).should.be.fulfilled
      await acl.assignRole('test', accounts[1], role2, { from: accounts[2] }).should.be.rejectedWith('unauthorized')
    })

    it('and emits an event when successful', async () => {
      const result = await acl.addAssigner('test', accounts[2], role1).should.be.fulfilled

      expect(extractEventArgs(result, events.AssignerAdded)).to.include({
        context: 'test',
        addr: accounts[2],
        role: role1,
      })
    })
  })

  describe('allows for an assigner to be removed for a given role', async () => {
    beforeEach(async () => {
      await acl.addAssigner('test', accounts[2], role1).should.be.fulfilled
    })

    it('but not by a non-admin', async () => {
      await acl.removeAssigner('test', accounts[2], role1, { from: accounts[1] }).should.be.rejectedWith('unauthorized')
    })

    it('by an admin', async () => {
      await acl.removeAssigner('test', accounts[2], role1).should.be.fulfilled
      await acl.isAssigner('test', accounts[2], role1).should.eventually.eq(false)
    })

    it('who can no longer assign roles', async () => {
      await acl.assignRole('test', accounts[1], role1, { from: accounts[2] }).should.be.fulfilled
      await acl.removeAssigner('test', accounts[2], role1).should.be.fulfilled
      await acl.assignRole('test', accounts[1], role1, { from: accounts[2] }).should.be.rejectedWith('unauthorized')
      await acl.unassignRole('test', accounts[1], role1, { from: accounts[2] }).should.be.rejectedWith('unauthorized')
    })

    it('who can no longer unassign roles', async () => {
      await acl.unassignRole('test', accounts[1], role1, { from: accounts[2] }).should.be.fulfilled
      await acl.removeAssigner('test', accounts[2], role1).should.be.fulfilled
      await acl.unassignRole('test', accounts[1], role1, { from: accounts[2] }).should.be.rejectedWith('unauthorized')
    })

    it('and emits an event when successful', async () => {
      const result = await acl.removeAssigner('test', accounts[2], role1).should.be.fulfilled

      expect(extractEventArgs(result, events.AssignerRemoved)).to.include({
        context: 'test',
        addr: accounts[2],
        role: role1,
      })
    })
  })
})

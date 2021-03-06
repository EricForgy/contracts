pragma solidity >=0.6.7;
pragma experimental ABIEncoderV2;

import "./base/Controller.sol";
import "./base/DiamondProxy.sol";

contract Entity is Controller, DiamondProxy {
  constructor (address _settings, address _entityAdmin) Controller(_settings) DiamondProxy() public {
    _registerFacets(settings().getRootAddresses(SETTING_ENTITY_IMPL));
    acl().assignRole(aclContext(), _entityAdmin, ROLE_ENTITY_ADMIN);
  }
}
